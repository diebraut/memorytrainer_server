from django.shortcuts import render

def index(request):
    # Startseite
    return render(request, "landing/index.html")

def pakete(request):
    # Seite mit Paketen / Knowledge-Tree
    return render(request, "landing/pakete.html")
