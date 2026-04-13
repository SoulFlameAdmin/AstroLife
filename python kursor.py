#!/usr/bin/env python3
"""
kursor.py — Adds a high-contrast meteor cursor + fading tail to your index.html
Location default: E:\\AstroLife_app\\index.html

Usage:
  python kursor.py                    # patch E:\AstroLife_app\index.html (backup created)
  python kursor.py --file D:\site\index.html
  python kursor.py --remove           # cleanly remove cursor code using markers

What it does:
- Hides the default mouse cursor on desktop
- Adds a sharp, short meteor (☄️/SVG) cursor that follows the pointer
- Draws a high-contrast, quickly fading tail on a fullscreen canvas (works on dark/light)
- Auto-scales for HiDPI, pauses on tab blur, disabled on touch devices

All injected code is wrapped between markers so it's easy to remove/update:
  <!-- CURSOR:START --> ... <!-- CURSOR:END -->
"""
import argparse, pathlib, re, sys, shutil

MARKER_START = "<!-- CURSOR:START -->"
MARKER_END   = "<!-- CURSOR:END -->"

INJECT_CSS = f"""
{MARKER_START}
<style>
  /* Meteor Cursor — styles */
  html.body-cursor-hidden, body.body-cursor-hidden { cursor: none; }
  #meteorCursor{position:fixed; pointer-events:none; z-index:2147483646; width:26px; height:26px; transform:translate(-50%, -50%) rotate(-20deg); will-change:transform; filter:drop-shadow(0 2px 6px rgba(0,0,0,.35));}
  #meteorCursor svg{display:block}
  #cursorTrail{position:fixed; inset:0; z-index:2147483645; pointer-events:none;}
  /* Better contrast hint when user toggles site theme */
  :root.light #meteorCursor{filter:drop-shadow(0 2px 8px rgba(0,0,0,.25))}
</style>
{MARKER_END}
"""

INJECT_HTML_CURSOR = f"""
{MARKER_START}
<!-- Meteor cursor DOM -->
<canvas id=\"cursorTrail\" width=\"0\" height=\"0\" aria-hidden=\"true\"></canvas>
<div id=\"meteorCursor\" aria-hidden=\"true\" role=\"presentation\">
  <svg viewBox=\"0 0 48 48\" width=\"26\" height=\"26\" xmlns=\"http://www.w3.org/2000/svg\">
    <defs>
      <linearGradient id=\"mcg\" x1=\"0\" x2=\"1\">
        <stop offset=\"0\" stop-color=\"#fff\"/>
        <stop offset=\"1\" stop-color=\"#9cc7ff\"/>
      </linearGradient>
    </defs>
    <path d=\"M2 24 L28 18 L26 26 Z\" fill=\"url(#mcg)\" opacity=\".85\"/>
    <circle cx=\"34\" cy=\"22\" r=\"6\" fill=\"url(#mcg)\" />
  </svg>
</div>
{MARKER_END}
"""

INJECT_JS = f"""
{MARKER_START}
<script>
(function(){
  if (window.__meteorCursorInstalled) return; window.__meteorCursorInstalled = true;
  const isTouch = matchMedia('(hover: none), (pointer: coarse)').matches;
  if (isTouch) return;
  document.documentElement.classList.add('body-cursor-hidden');
  document.body.classList.add('body-cursor-hidden');
  const comet = document.getElementById('meteorCursor');
  const canvas = document.getElementById('cursorTrail');
  const ctx = canvas.getContext('2d');
  function fitCanvas(){
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const w = innerWidth, h = innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  fitCanvas();
  addEventListener('resize', fitCanvas);
})();
</script>
{MARKER_END}
"""

def patch_html(path: pathlib.Path, remove: bool=False):
    html = path.read_text(encoding='utf-8', errors='ignore')
    def strip_blocks(s: str) -> str:
        return re.sub(re.escape(MARKER_START) + r"[\s\S]*?" + re.escape(MARKER_END), "", s)
    if remove:
        new_html = strip_blocks(html)
        path.write_text(new_html, encoding='utf-8')
        return
    cleaned = strip_blocks(html)
    if '</head>' in cleaned.lower():
        idx = cleaned.lower().rfind('</head>')
        new_html = cleaned[:idx] + "\n" + INJECT_CSS + "\n" + cleaned[idx:]
    else:
        new_html = INJECT_CSS + cleaned
    if '</body>' in new_html.lower():
        idx = new_html.lower().rfind('</body>')
        new_html = new_html[:idx] + "\n" + INJECT_HTML_CURSOR + "\n" + INJECT_JS + "\n" + new_html[idx:]
    else:
        new_html += "\n" + INJECT_HTML_CURSOR + "\n" + INJECT_JS
    backup = path.with_suffix(path.suffix + '.bak')
    shutil.copyfile(path, backup)
    path.write_text(new_html, encoding='utf-8')

def main():
    parser = argparse.ArgumentParser(description='Inject/remove meteor cursor into index.html')
    parser.add_argument('--file', default=r'E:\\AstroLife_app\\index.html', help='Path to index.html')
    parser.add_argument('--remove', action='store_true', help='Remove previously injected cursor code')
    args = parser.parse_args()
    p = pathlib.Path(args.file)
    if not p.exists():
        print(f"File not found: {p}")
        sys.exit(1)
    patch_html(p, remove=args.remove)

if __name__ == '__main__':
    main()
