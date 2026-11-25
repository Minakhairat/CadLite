import http.server, os
os.chdir('/tmp/coex')
class H(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/old/sw.js') and os.path.exists('/tmp/coex/old404'):
            self.send_response(404); self.end_headers(); return
        super().do_GET()
    def end_headers(self):
        self.send_header('Cache-Control','no-store'); super().end_headers()
http.server.ThreadingHTTPServer(('127.0.0.1',4190),H).serve_forever()
