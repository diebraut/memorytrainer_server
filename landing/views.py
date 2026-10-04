from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie

def index(request):
    # Startseite
    return render(request, "landing/index.html")

@ensure_csrf_cookie
def pakete(request):
    # Seite mit Paketen / Knowledge-Tree
    return render(request, "landing/pakete.html")
