import os
import http.server
import socketserver
from pathlib import Path

# Get environment variables (with defaults for testing)
POSTHOG_API_KEY = os.environ.get("POSTHOG_API_KEY", "phc_default_placeholder_key")
FEATURE_FLAG_KEY = os.environ.get("FEATURE_FLAG_KEY", "test-anon-2")
API_HOST = os.environ.get("API_HOST", "http://localhost:8010")

# Read the template HTML
html_template = Path("index.html").read_text()

# Replace the placeholders with the actual values
html_content = html_template.replace("{{POSTHOG_API_KEY}}", POSTHOG_API_KEY)
html_content = html_content.replace("{{FEATURE_FLAG_KEY}}", FEATURE_FLAG_KEY)
html_content = html_content.replace("http://localhost:8010", API_HOST)


# Create a custom request handler
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


# Set up and start the server
PORT = int(os.environ.get("PORT", 5001))
Handler = CustomHTTPRequestHandler
with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Serving at http://localhost:{PORT}")
    print(f"API key: {POSTHOG_API_KEY}")
    print(f"Feature flag key: {FEATURE_FLAG_KEY}")
    print(f"API host: {API_HOST}")
    httpd.serve_forever()
