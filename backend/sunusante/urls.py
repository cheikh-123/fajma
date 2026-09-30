"""Routes de l'API Fajma (toutes sous /api/) et interface d'administration Django (/django-admin/)."""

from django.contrib import admin
from django.urls import include, path

from accounts import views as accounts
from audit import views as audit
from appointments import views as appointments
from bots import views as bots
from clinics import patients as clinic_patients
from clinics import views as clinics
from directory import calendar_sync, credentials, replacements, reviews, seo
from directory import views as directory
from directory import views_pro as pro
from carnet import views as carnet
from expertise import views as expertise
from insurance import views as insurance
from medical import issued
from medical import views as medical
from messaging import views as messaging
from notifications import push, stream
from notifications import views as notifications
from payments import views as payments
from pharmacy import views as pharmacy
from payments import views_finance as finance
from payments.plans import public_plans

from accounts.security import admin_login

from care import views as care
from labs import views as labs
from support import views as support
from medical import ai_notes
from medical import emergency, renewals

from . import analytics as core_analytics
from . import exports
from . import views as core

# /django-admin/ : pas de connexion par mot de passe seul, on passe par la connexion Fajma (double authentification).
admin.site.login = admin_login

auth_urls = [
    path("csrf", accounts.csrf),
    path("me", accounts.me),
    path("language", accounts.set_language),
    path("register", accounts.register),
    path("login", accounts.login_view),
    path("logout", accounts.logout_view),
    path("demo-login", accounts.demo_login),
    path("password-change", accounts.password_change),
    path("password-reset", accounts.password_reset),
    path("password-reset/confirm", accounts.password_reset_confirm),
    path("export", accounts.export_my_data),
    path("delete-account", accounts.delete_my_account),
    path("login/mfa", accounts.login_mfa),
    path("mfa", accounts.mfa_setup),
    path("otp/request", accounts.otp_request),
    path("otp/verify", accounts.otp_verify),
]

directory_urls = [
    path("specialties", directory.list_specialties),
    path("stats", directory.public_stats),
    path("localities", directory.list_localities),
    path("doctors", directory.list_doctors),
    path("doctors/<uuid:doctor_id>", directory.get_doctor),
    path("doctors/<uuid:doctor_id>/reviews", directory.list_doctor_reviews),
    path("doctors/<uuid:doctor_id>/slots", directory.list_doctor_slots),
    path("plans", public_plans),
    path("doctors/<uuid:doctor_id>/photo", directory.doctor_photo),
    path("pharmacies", directory.list_pharmacies),
    path("clinics", clinics.public_clinics),
    path("clinics/<uuid:clinic_id>", clinics.public_clinic),
    path("assistant", directory.ask_assistant),
]

patient_urls = [
    path("health", accounts.my_health_data),
    path("my-doctors", accounts.my_doctors),
    path("measurements", care.my_measurements),
    path("measurements/<uuid:measurement_id>/delete", care.delete_measurement),
    path("medication-reminders", care.my_medication_reminders),
    path("medication-reminders/<uuid:reminder_id>", care.update_medication_reminder),
    path("profile", accounts.update_profile),
    path("relatives", accounts.relatives),
    path("relatives/<uuid:relative_id>/delete", accounts.delete_relative),
    path("reviews", directory.create_review),
    path("health-profile", medical.my_health_profile),
    path("emergency-card", emergency.my_emergency_settings),
    path("renewals", renewals.my_renewals),
    path("renewals/<uuid:renewal_id>/cancel", renewals.cancel_renewal),
    path("access-log", audit.my_access_log),
    path("notifications", notifications.my_notifications),
    path("notifications/read", notifications.mark_notifications_read),
    path("waitlist", appointments.my_waitlist),
    path("waitlist/<uuid:doctor_id>", appointments.waitlist_entry),
    path("waitlist/<uuid:doctor_id>/join", appointments.join_waitlist),
    path("waitlist/<uuid:doctor_id>/leave", appointments.leave_waitlist),
]

appointment_urls = [
    path("", appointments.create_appointment),
    path("mine", appointments.my_appointments),
    path("series/preview", appointments.preview_series),
    path("<uuid:appointment_id>/cancel", appointments.cancel_appointment),
    path("<uuid:appointment_id>/questionnaire", appointments.answer_questionnaire),
    path("<uuid:appointment_id>/reschedule", appointments.reschedule_appointment),
    path("<uuid:appointment_id>/teleconsultation", appointments.teleconsultation_access),
    path("<uuid:appointment_id>/ics", appointments.appointment_ics),
    path("<uuid:appointment_id>/teleconsultation/ready", appointments.teleconsultation_ready),
    path("<uuid:appointment_id>/teleconsultation/start", appointments.teleconsultation_start),
]

pro_urls = [
    path("profile", pro.my_doctor_profile),
    path("prescription-header", pro.my_prescription_header),
    path("appointments", appointments.doctor_appointments),
    path("appointments/<uuid:appointment_id>/status", appointments.doctor_update_status),
    path("appointments/<uuid:appointment_id>/record", medical.save_consultation_record),
    path("appointments/<uuid:appointment_id>/ai-draft", ai_notes.draft_record),
    path("appointments/<uuid:appointment_id>/arrived", appointments.doctor_mark_arrived),
    path("appointments/<uuid:appointment_id>/repeat", appointments.doctor_repeat_appointment),
    path("appointments/new", appointments.pro_new_appointment),
    path("appointments/<uuid:appointment_id>/lab-order", labs.prescribe),
    path("lab-orders/<uuid:order_id>/cancel", labs.cancel_order),
    path("appointments/<uuid:appointment_id>/move", appointments.pro_move_appointment),
    path("known-patients", appointments.pro_known_patients),
    path("export/appointments.csv", exports.pro_appointments_csv),
    path("export/insurance.csv", exports.pro_insurance_csv),
    path("export/finance.csv", exports.pro_finance_csv),
    path("profile/edit", pro.edit_my_doctor_profile),
    path("profile/photo", pro.my_doctor_photo),
    path("secretariat", clinics.doctor_secretariat),
    path("replacements", replacements.my_replacements),
    path("replacements/<uuid:replacement_id>/respond", replacements.respond_replacement),
    path("replacements/<uuid:replacement_id>/cancel", replacements.cancel_replacement),
    path("patients/<uuid:patient_id>", medical.patient_file),
    path("settings", pro.my_settings),
    path("time-off", pro.my_time_off),
    path("time-off/<uuid:time_off_id>/delete", pro.delete_time_off),
    path("stats", pro.my_stats),
    path("locations", pro.my_locations),
    path("locations/<uuid:location_id>/delete", pro.delete_location),
    path("appointments/<uuid:appointment_id>/cash-paid", payments.mark_cash_paid),
    path("appointments/<uuid:appointment_id>/vaccination", carnet.doctor_record_dose),
    path("questionnaires", pro.my_questionnaires),
    path("reviews", reviews.pro_reviews),
    path("calendar", calendar_sync.pro_calendar),
    path("calendar/sync", calendar_sync.pro_calendar_sync),
    path("calendar/reset", calendar_sync.pro_calendar_reset),
    path("credentials", credentials.my_credentials),
    path("credentials/<uuid:credential_id>/delete", credentials.delete_credential),
    path("credentials/<uuid:credential_id>/file", credentials.credential_file),
    path("reviews/<uuid:review_id>/reply", reviews.pro_reply),
    path("reviews/<uuid:review_id>/report", reviews.pro_report),
    path("appointments/<uuid:appointment_id>/documents", issued.issue_document),
    path("finance", finance.pro_finance),
    path("payouts", finance.pro_request_payout),
    path("subscription/checkout", finance.pro_subscription_checkout),
    path("subscription/<uuid:payment_id>/refresh", finance.pro_subscription_refresh),
    path("patients/<uuid:patient_id>/recalls", medical.add_recall),
    path("recalls/<uuid:recall_id>/delete", medical.delete_recall),
    path("onboarding", pro.my_onboarding),
    path("renewals", renewals.pro_renewals),
    path("renewals/<uuid:renewal_id>", renewals.pro_decide_renewal),
    path("availability", pro.my_availability),
    path("availability/<uuid:availability_id>", pro.update_availability),
    path("availability/<uuid:availability_id>/delete", pro.delete_availability),
    path("consultation-types", pro.my_consultation_types),
    path("consultation-types/<uuid:type_id>", pro.update_consultation_type),
    path("consultation-types/<uuid:type_id>/delete", pro.delete_consultation_type),
    path("waitlist-count", pro.my_waitlist_count),
]

payment_urls = [
    path("start", payments.start_payment),
    path("<uuid:payment_id>/refresh", payments.refresh_payment),
    path("<uuid:payment_id>/receipt", payments.receipt),
    path("paydunya/webhook", payments.paydunya_webhook),
]

document_urls = [
    path("", medical.my_documents),
    path("<uuid:document_id>/url", medical.document_url),
    path("<uuid:document_id>/download", medical.download_document),
    path("<uuid:document_id>/delete", medical.delete_document),
    path("<uuid:document_id>/share", medical.share_document),
    path("share-targets", medical.share_targets),
    path("prescriptions/<uuid:prescription_id>", medical.get_prescription),
    path("prescriptions/verify", medical.verify_prescription),
    path("issued", issued.my_issued_documents),
    path("issued/<uuid:document_id>", issued.get_issued_document),
]

message_urls = [
    path("threads", messaging.list_threads),
    path("thread", messaging.get_thread),
    path("send", messaging.send_message),
    path("<uuid:message_id>/attachment", messaging.message_attachment),
]

clinic_urls = [
    path("mine", clinics.my_clinic),
    path("candidates", clinics.candidates),
    path("staff/<uuid:staff_id>/delete", clinics.remove_staff),
    path("<uuid:clinic_id>/members", clinics.add_member),
    path("<uuid:clinic_id>/members/<uuid:member_id>/delete", clinics.remove_member),
    path("<uuid:clinic_id>/update", clinics.update_clinic),
    path("<uuid:clinic_id>/staff", clinics.add_staff),
    path("<uuid:clinic_id>/agenda", clinics.agenda),
    path("<uuid:clinic_id>/book", clinics.book),
    path("<uuid:clinic_id>/appointments/<uuid:appointment_id>", clinics.update_appointment),
    path("<uuid:clinic_id>/appointments/<uuid:appointment_id>/repeat", clinics.repeat),
    path("<uuid:clinic_id>/appointments/<uuid:appointment_id>/move", clinics.move),
    path("<uuid:clinic_id>/export.csv", exports.clinic_appointments_csv),
    path("<uuid:clinic_id>/patients", clinic_patients.clinic_patients),
    path("<uuid:clinic_id>/patients/unify", clinic_patients.unify_name),
    path("<uuid:clinic_id>/patients/link", clinic_patients.link_to_account),
]

admin_urls = [
    path("analytics", core_analytics.admin_analytics),
    path("finance", finance.admin_finance),
    path("pharmacy-members", pharmacy.admin_members),
    path("pharmacies", pharmacy.admin_pharmacies),
    path("laboratories", labs.admin_laboratories),
    path("laboratories/<uuid:laboratory_id>/members", labs.admin_lab_member),
    path("pharmacies/<uuid:pharmacy_id>", pharmacy.admin_update_pharmacy),
    path("reviews", reviews.admin_reviews),
    path("credentials", credentials.admin_credentials),
    path("credentials/<uuid:credential_id>", credentials.admin_review_credential),
    path("reviews/<uuid:review_id>", reviews.admin_moderate),
    path("pharmacy-members/<uuid:member_id>/delete", pharmacy.admin_remove_member),
    path("payouts/<uuid:payout_id>", finance.admin_process_payout),
    path("refunds/<uuid:refund_id>", finance.admin_complete_refund),
    path("overview", accounts.admin_overview),
    path("todo", accounts.admin_todo),
    path("support", support.admin_list),
    path("support/<uuid:request_id>", support.admin_close),
    path("users", accounts.admin_users),
    path("users/<uuid:user_id>", accounts.admin_user_action),
    path("verification", accounts.admin_set_verification),
    path("sms", accounts.admin_sms_reminders),
    path("sms/retry", accounts.admin_retry_sms),
    path("audit", audit.admin_audit_log),
]

expertise_urls = [
    path("", expertise.requests),
    path("experts", expertise.experts),
    path("patients", expertise.my_patients),
    path("<uuid:request_id>", expertise.detail),
    path("<uuid:request_id>/messages", expertise.reply),
    path("<uuid:request_id>/close", expertise.close),
]

carnet_urls = [
    path("", carnet.my_carnet),
    path("vaccines", carnet.vaccine_catalog),
    path("doses", carnet.record_dose),
    path("doses/<uuid:dose_id>/delete", carnet.delete_dose),
    path("pregnancies", carnet.start_pregnancy),
    path("pregnancies/<uuid:pregnancy_id>/visits", carnet.record_visit),
    path("pregnancies/<uuid:pregnancy_id>/end", carnet.end_pregnancy),
]

insurance_urls = [
    path("insurers", insurance.list_insurers),
    path("coverages", insurance.my_coverages),
    path("coverages/<uuid:coverage_id>/delete", insurance.delete_coverage),
    path("pro", insurance.pro_insurers),
]

pharmacy_urls = [
    path("orders", pharmacy.my_orders),
    path("orders/<uuid:order_id>/cancel", pharmacy.cancel_my_order),
    path("orders/<uuid:order_id>/status", pharmacy.update_order),
    path("receiving", pharmacy.receiving_pharmacies),
    path("dashboard", pharmacy.dashboard),
    path("mine", pharmacy.my_pharmacies),
    path("queries", pharmacy.my_medicine_queries),
    path("answers/<uuid:answer_id>", pharmacy.answer_medicine_query),
]

urlpatterns = [
    path("django-admin/", admin.site.urls),
    path("api/auth/", include(auth_urls)),
    path("api/directory/", include(directory_urls)),
    path("api/patient/", include(patient_urls)),
    path("api/appointments/", include(appointment_urls)),
    path("api/pro/", include(pro_urls)),
    path("api/payments/", include(payment_urls)),
    path("api/documents/", include(document_urls)),
    path("api/messages/", include(message_urls)),
    path("api/clinics/", include(clinic_urls)),
    path("api/admin/", include(admin_urls)),
    path("api/notifications/twilio-status", notifications.twilio_status),
    path("api/notifications/push/key", push.push_key),
    path("api/notifications/push/subscribe", push.push_subscribe),
    path("api/notifications/push/unsubscribe", push.push_unsubscribe),
    path("api/health", core.health),
    path("api/support", support.create_request),
    path("api/emergency/<str:token>", emergency.public_card),
    path("api/events", stream.event_stream),
    path("api/calendar/<str:token>.ics", calendar_sync.calendar_feed),
    path("api/client-errors", core.client_error),
    path("api/pharmacy/", include(pharmacy_urls)),
    path("api/labs/", include([
        path("orders", labs.my_lab_orders),
        path("orders/<uuid:order_id>/send", labs.send_to_lab),
        path("orders/<uuid:order_id>/receive", labs.lab_receive),
        path("orders/<uuid:order_id>/result", labs.lab_result),
        path("laboratories", labs.laboratories),
        path("dashboard", labs.lab_dashboard),
    ])),
    path("api/insurance/", include(insurance_urls)),
    path("api/carnet/", include(carnet_urls)),
    path("api/expertise/", include(expertise_urls)),
    path("api/bots/whatsapp", bots.whatsapp),
    path("api/bots/ussd", bots.ussd),
    # Référencement (nginx n'envoie /seo/… qu'aux robots).
    path("robots.txt", seo.robots_txt),
    path("sitemap.xml", seo.sitemap_xml),
    path("seo/medecins/<uuid:doctor_id>", seo.doctor_page),
    path("seo/specialites/<slug:slug>", seo.specialty_page),
]
