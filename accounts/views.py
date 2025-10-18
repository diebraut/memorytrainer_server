from django.contrib import messages
from django.contrib.auth import authenticate, login
from django.contrib.auth.forms import AuthenticationForm
from django.contrib.auth.models import User
from django.contrib.auth.tokens import default_token_generator
from django.http import Http404
from django.shortcuts import render, redirect
from django.template.loader import render_to_string
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.views.decorators.http import require_http_methods
from django.conf import settings
from django.core.mail import send_mail


from .forms import RegisterForm

LOGIN_REDIRECT = "/pakete/"

@require_http_methods(["GET", "POST"])
def login_register(request):
    login_form = AuthenticationForm(request, data=request.POST if request.POST.get("action")=="login" else None)
    reg_form = RegisterForm(request.POST if request.POST.get("action")=="register" else None)

    # --- Login ---
    if request.method == "POST" and request.POST.get("action") == "login":
        if login_form.is_valid():
            user = login_form.get_user()
            login(request, user)
            return redirect(LOGIN_REDIRECT)
        messages.error(request, "Anmeldung fehlgeschlagen.")

    # --- Registrierung ---
    if request.method == "POST" and request.POST.get("action") == "register":
        if reg_form.is_valid():
            username = reg_form.cleaned_data["trainee"].strip()
            email = reg_form.cleaned_data["email"].strip().lower()
            pwd = reg_form.cleaned_data["password1"]

            # Benutzer inaktiv anlegen (muss per E-Mail aktiviert werden)
            user = User.objects.create_user(
                username=username,
                email=email,
                password=pwd,
                is_active=False,
            )

            # optional: den Anzeigenamen in first_name spiegeln
            user.first_name = username
            user.save(update_fields=["first_name"])

            # Aktivierungslink bauen
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            activation_url = request.build_absolute_uri(f"/activate/{uid}/{token}/")

            # E-Mail senden (Text + optional HTML)
            subject = "Bitte Registrierung bestätigen"
            context = {"username": username, "activation_url": activation_url}
            message = render_to_string("accounts/activation_email.txt", context)
            html_message = render_to_string("accounts/activation_email.txt", context)
            send_mail(
                subject,
                message,
                getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@example.com"),
                [email],
                html_message=html_message,
            )

            messages.success(request, "Fast geschafft! Bitte prüfe deine E-Mails und bestätige die Registrierung.")
            return redirect("login_register")  # gleiche Seite, empty forms

        messages.error(request, "Registrierung fehlgeschlagen. Bitte Eingaben prüfen.")

    return render(request, "accounts/login_register.html", {
        "login_form": login_form,
        "reg_form": reg_form,
    })


def activate(request, uidb64, token):
    try:
        uid = urlsafe_base64_decode(uidb64).decode()
        user = User.objects.get(pk=uid)
    except Exception:
        raise Http404("Ungültiger Aktivierungslink.")

    if default_token_generator.check_token(user, token):
        user.is_active = True
        user.save(update_fields=["is_active"])
        # Optional: direkt einloggen
        user = authenticate(request, username=user.username, password=None)  # wird None liefern
        # -> Stattdessen manuell einloggen, wenn gewünscht:
        # login(request, user)  # funktioniert nur mit bekanntem Passwort; wir lassen es weg.
        messages.success(request, "Dein Account wurde aktiviert. Bitte melde dich jetzt an.")
        return redirect("login_register")
    else:
        messages.error(request, "Aktivierungslink ist ungültig oder abgelaufen.")
        return redirect("login_register")
