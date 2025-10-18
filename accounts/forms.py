from django import forms
from django.contrib.auth.models import User
from django.contrib.auth.forms import AuthenticationForm

class RegisterForm(forms.Form):
    trainee = forms.CharField(label="Trainee", min_length=3, max_length=150)
    email = forms.EmailField(label="E-Mail-Adresse")
    password1 = forms.CharField(label="Passwort", widget=forms.PasswordInput, min_length=8)
    password2 = forms.CharField(label="Passwort (Wiederholung)", widget=forms.PasswordInput, min_length=8)

    def clean_trainee(self):
        username = self.cleaned_data["trainee"].strip()
        if User.objects.filter(username__iexact=username).exists():
            raise forms.ValidationError("Dieser Trainee-Name ist bereits vergeben.")
        return username

    def clean_email(self):
        email = self.cleaned_data["email"].strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise forms.ValidationError("Diese E-Mail wird bereits verwendet.")
        return email

    def clean(self):
        cleaned = super().clean()
        p1, p2 = cleaned.get("password1"), cleaned.get("password2")
        if p1 and p2 and p1 != p2:
            self.add_error("password2", "Passwörter stimmen nicht überein.")
        return cleaned
