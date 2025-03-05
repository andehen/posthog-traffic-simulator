import os
import http.server
import socketserver
from pathlib import Path

POSTHOG_API_KEY = os.environ.get("POSTHOG_API_KEY", "phc_default_placeholder_key")
FEATURE_FLAG_KEY = os.environ.get("FEATURE_FLAG_KEY", "test-anon-2")
API_HOST = os.environ.get("API_HOST", "http://localhost:8010")
PORT = int(os.environ.get("PORT", 5001))

html_template = Path("index.html").read_text()

html_content = html_template.replace("{{POSTHOG_API_KEY}}", POSTHOG_API_KEY)
html_content = html_content.replace("{{FEATURE_FLAG_KEY}}", FEATURE_FLAG_KEY)
html_content = html_content.replace("http://localhost:8010", API_HOST)


class CustomHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/" or self.path == "/index.html":
            self.send_response(200)
            self.send_header("Content-type", "text/html")
            self.end_headers()
            self.wfile.write(html_content.encode())
        else:
            # Handle other static files normally
            super().do_GET()


class ReuseAddressTCPServer(socketserver.TCPServer):
    allow_reuse_address = True


Handler = CustomHTTPRequestHandler
with ReuseAddressTCPServer(("", PORT), Handler) as httpd:
    print(f"Serving at http://localhost:{PORT}")
    print(f"API key: {POSTHOG_API_KEY}")
    print(f"Feature flag key: {FEATURE_FLAG_KEY}")
    print(f"API host: {API_HOST}")
    httpd.serve_forever()
