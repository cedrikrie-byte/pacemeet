# Wandelt den Single-File-Build in eine Artifact-Seite um (ohne <html>/<head>/<body>).
import re, sys
src = open("dist/index.html", encoding="utf-8").read()
styles = re.findall(r"<style[^>]*>.*?</style>", src, re.S)
scripts = re.findall(r"<script type=\"module\"[^>]*>.*?</script>", src, re.S)
fonts = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,500..900&family=Figtree:wght@400;500;600;700&display=swap">'
out = "\n".join(["<title>PaceMeet</title>", fonts, *styles, '<div id="root"></div>', *scripts])
open(sys.argv[1], "w", encoding="utf-8").write(out)
print(len(out))
