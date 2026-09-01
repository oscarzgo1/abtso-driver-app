"""
Static file server for the Flutter web release build, with caching fully
disabled. Plain `python -m http.server` sends no Cache-Control headers,
which lets Chrome's heuristic HTTP cache hold onto main.dart.js across
reloads and even full navigations — so a rebuilt app can silently keep
serving old code. This wrapper exists solely to stop that.

Usage: python serve_no_cache.py [port] [directory]
"""
import sys
import functools
import http.server


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5000
    directory = sys.argv[2] if len(sys.argv) > 2 else "build/web"
    handler = functools.partial(NoCacheHandler, directory=directory)
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), handler) as httpd:
        print(f"Serving {directory} on http://127.0.0.1:{port} (caching disabled)")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
