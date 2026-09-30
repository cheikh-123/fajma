"""
ASGI config for sunusante project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/6.1/howto/deployment/asgi/
"""

import os

from django.core.asgi import get_asgi_application

# Forcé : une variable DJANGO_SETTINGS_MODULE globale (autre projet) ne doit pas prendre le dessus.
os.environ['DJANGO_SETTINGS_MODULE'] = 'sunusante.settings'

application = get_asgi_application()
