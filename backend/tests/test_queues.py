"""Ticket virtuel : prise de ticket (site, USSD), ordre de passage, priorités, alertes, guichet, écran, droits."""

from datetime import time, timedelta

from django.test import override_settings
from django.utils import timezone

from notifications.models import Notification
from queues import logic
from queues.models import Facility, FacilityAgent, QueueService, QueueTicket

from .test_security import ApiTestCase

ALL_DAYS = [1, 2, 3, 4, 5, 6, 7]


class QueueTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.facility = Facility.objects.create(name="Hôpital de Fann", city="Dakar", address="Avenue Cheikh Anta Diop")
        self.service = QueueService.objects.create(
            facility=self.facility, name="Consultation générale", prefix="A", opens_at=time(0, 0), closes_at=time(23, 59),
            open_days=ALL_DAYS, avg_minutes=10, notice_ahead=1,
        )
        self.agent = self.make_user("accueil@test.sn", "Agent Accueil")
        FacilityAgent.objects.create(facility=self.facility, user=self.agent, role="agent")
        self.p1.phone, self.p1.phone_verified = "+221771234567", True
        self.p1.save()

    def take(self, user, **extra):
        return self.client_for(user).post(f"/api/queues/services/{self.service.id}/take", extra, format="json")

    def call(self, desk="Box 1", user=None):
        return self.client_for(user or self.agent).post(f"/api/queues/services/{self.service.id}/call", {"desk": desk}, format="json")

    def test_take_ticket_is_numbered_and_idempotent(self):
        first = self.take(self.p1)
        self.assertEqual(first.status_code, 200, first.data)
        self.assertEqual((first.data["label"], first.data["ahead"]), ("A1", 0))
        self.assertEqual(self.take(self.p1).data["code"], first.data["code"])  # même ticket, pas de doublon
        second = self.take(self.p2)
        self.assertEqual((second.data["label"], second.data["ahead"], second.data["eta_minutes"]), ("A2", 1, 15))
        self.assertTrue(Notification.objects.filter(user=self.p1, kind="queue").exists())
        self.assertEqual(self.client_for().post(f"/api/queues/services/{self.service.id}/take").status_code, 403)

    def test_priority_and_call_order(self):
        for user in (self.p1, self.p2, self.doc_user):
            self.take(user)
        third = QueueTicket.objects.get(number=3)
        res = self.client_for(self.agent).post(f"/api/queues/tickets/{third.id}/action", {"action": "priority", "priority": "enceinte"}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(self.call().data["label"], "A3")  # la femme enceinte passe d'abord
        self.assertEqual(self.call(desk="Box 2").data["label"], "A1")
        called = QueueTicket.objects.get(number=1)
        self.assertEqual((called.status, called.desk), ("called", "Box 2"))
        self.assertTrue(Notification.objects.filter(user=self.p1, title__contains="votre tour").exists())

    def test_agent_actions_and_requeue(self):
        self.take(self.p1)
        ticket_id = self.call().data["id"]
        act = lambda action: self.client_for(self.agent).post(f"/api/queues/tickets/{ticket_id}/action", {"action": action}, format="json")  # noqa: E731
        self.assertEqual(act("recall").status_code, 200)
        self.assertEqual(act("no_show").data["status"], "no_show")
        self.assertEqual(act("requeue").data["status"], "waiting")  # arrivé en retard : reprend sa place
        self.call()
        self.assertEqual(act("done").data["status"], "done")
        self.assertEqual(self.call().status_code, 400)  # plus personne

    def test_soon_and_leave_now_messages(self):
        self.service.notice_ahead = 1
        self.service.save()
        for user in (self.p1, self.p2):
            self.take(user)
        late = self.make_user("loin@test.sn", "Habite Loin", phone="+221771111111")
        res = self.take(late, travel_minutes=30)
        self.assertEqual(res.data["ahead"], 2)
        self.assertTrue(res.data["leave_now"])  # 25 min d'attente < 30 min de trajet + marge
        self.call()
        t = QueueTicket.objects.get(number=3)
        self.assertIsNotNone(t.soon_sent_at)  # plus qu'une personne devant
        self.assertIsNotNone(QueueTicket.objects.get(number=2).soon_sent_at)

    def test_public_tracking_cancel_and_display(self):
        code = self.take(self.p1).data["code"]
        self.take(self.p2)
        anon = self.client_for()
        self.assertEqual(anon.get(f"/api/queues/tickets/{code}").data["label"], "A1")
        self.assertNotIn("name", anon.get(f"/api/queues/tickets/{code}").data)
        self.call()
        screen = anon.get(f"/api/queues/facilities/{self.facility.id}/display").data
        self.assertEqual(screen["services"][0]["called"], [{"label": "A1", "desk": "Box 1"}])
        self.assertEqual(screen["services"][0]["waiting"], 1)
        code2 = QueueTicket.objects.get(number=2).code
        self.assertEqual(anon.post(f"/api/queues/tickets/{code2}/cancel").data["status"], "cancelled")
        self.assertEqual(anon.get("/api/queues/tickets/INCONNU123").status_code, 404)

    def test_closed_paused_and_capacity(self):
        self.service.is_paused, self.service.pause_message = True, "Médecin absent ce matin"
        self.service.save()
        res = self.take(self.p1)
        self.assertEqual((res.status_code, res.data["error"]), (400, "Médecin absent ce matin"))
        self.service.is_paused, self.service.daily_capacity = False, 1
        self.service.save()
        self.assertEqual(self.take(self.p1).status_code, 200)
        self.assertIn("Tous les tickets du jour", self.take(self.p2).data["error"])
        # Au guichet, l'accueil peut toujours remettre un ticket (personne venue sur place, sans téléphone).
        walk = self.client_for(self.agent).post(f"/api/queues/services/{self.service.id}/walk-in", {"name": "Mame Fatou", "priority": "age"}, format="json")
        self.assertEqual((walk.status_code, walk.data["label"], walk.data["channel"]), (200, "A2", "desk"))

    def test_access_rules(self):
        self.take(self.p1)
        self.assertEqual(self.call(user=self.p2).status_code, 404)
        self.assertEqual(self.client_for(self.p1).get("/api/queues/desk").status_code, 403)
        desk = self.client_for(self.agent).get("/api/queues/desk").data
        row = desk[0]["services"][0]["queue"][0]
        self.assertEqual(row["phone_hint"], "•• 4567")  # numéro masqué à l'accueil
        self.assertNotIn("stats", desk[0]["services"][0])  # bilan : responsable seulement
        url = f"/api/queues/facilities/{self.facility.id}/services"
        self.assertEqual(self.client_for(self.agent).post(url, {"name": "Pédiatrie"}, format="json").status_code, 403)
        FacilityAgent.objects.filter(user=self.agent).update(role="manager")
        res = self.client_for(self.agent).post(url, {"name": "Pédiatrie", "prefix": "p", "opens_at": "08:00", "closes_at": "13:00", "open_days": [1, 2, 3]}, format="json")
        self.assertEqual((res.status_code, res.data["prefix"]), (200, "P"))
        self.assertIn("stats", self.client_for(self.agent).get("/api/queues/desk").data[0]["services"][0])
        self.assertTrue(self.client_for(self.agent).get("/api/auth/me").data["user"]["is_queue_agent"])

    def test_admin_creates_facility_and_attaches_agent(self):
        admin = self.make_user("adm@test.sn", "Admin", is_staff=True)
        client = self.client_for(admin)
        self.assertEqual(self.client_for(self.p1).get("/api/admin/facilities").status_code, 403)
        rows = client.post("/api/admin/facilities", {"name": "Centre de santé de Pikine", "kind": "centre_sante", "city": "Pikine"}, format="json").data
        created = next(r for r in rows if r["name"] == "Centre de santé de Pikine")
        res = client.post(f"/api/admin/facilities/{created['id']}", {"agent_email": "p2@test.sn", "role": "manager"}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(FacilityAgent.objects.filter(user=self.p2, role="manager").exists())

    def test_old_tickets_expire(self):
        self.take(self.p1)
        QueueTicket.objects.update(day=timezone.localdate() - timedelta(days=1))
        self.assertEqual(logic.expire_old_tickets(), 1)
        self.assertEqual(QueueTicket.objects.get().status, "expired")


@override_settings(USSD_SECRET="ussd-secret")
class QueueUssdTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        facility = Facility.objects.create(name="Hôpital Principal", city="Dakar")
        QueueService.objects.create(facility=facility, name="Médecine", prefix="M", opens_at=time(0, 0), closes_at=time(23, 59), open_days=ALL_DAYS)

    def ussd(self, text, session="Q1", phone="221770000009"):
        res = self.client.post("/api/bots/ussd", {"sessionId": session, "phoneNumber": phone, "text": text}, HTTP_X_USSD_SECRET="ussd-secret")
        return res.content.decode()

    def test_take_ticket_without_internet(self):
        self.assertIn("5. Ticket hôpital", self.ussd(""))
        confirm = self.ussd("5*1*1*1*1")
        self.assertIn("Prendre un ticket ?", confirm)
        done = self.ussd("5*1*1*1*1*1")
        self.assertTrue(done.startswith("END Votre ticket : M1"), done)
        self.assertLessEqual(len(done), 182)
        self.assertEqual(QueueTicket.objects.get().channel, "ussd")
        status = self.ussd("5*2", session="Q2")
        self.assertIn("Ticket M1", status)
        self.assertIn("0 personne(s) devant vous", status)
