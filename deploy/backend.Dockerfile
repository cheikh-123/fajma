# API Fajma (Django) : sert l'API avec gunicorn ; la même image fait tourner le worker et le planificateur.
FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 DJANGO_DEBUG=false
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
# Les fichiers statiques de l'administration sont collectés à la construction (clé factice suffisante ici).
RUN DJANGO_SECRET_KEY=build-only python manage.py collectstatic --noinput
RUN useradd --create-home fajma && mkdir -p /data/private_media && chown -R fajma /data /app
USER fajma
EXPOSE 8000
CMD ["gunicorn", "sunusante.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--threads", "8", "--timeout", "60", "--access-logfile", "-"]
