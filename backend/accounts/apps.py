from django.apps import AppConfig


class AccountsConfig(AppConfig):
    name = 'accounts'

    def ready(self):
        from django.contrib.auth.signals import user_logged_in

        from .devices import on_login

        user_logged_in.connect(on_login, dispatch_uid="fajma_known_device")
