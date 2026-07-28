import sys

with open('views/index.ejs', 'r') as f:
    content = f.read()

# Non-featured links structure:
old_nf = """<div data-testid="NewLinkContainer" id="574249245" data-sticker-anchor="link" data-is-featured="false" data-style-type="OUTLINE" data-layout="stack" data-corner-style="ROUNDED_NONE" data-shadow-type="SHADOW_NONE" class="group" tabindex="0" style="opacity:1; <%= link.transparent ? 'background: transparent !important; border: 1px solid rgba(255,255,255,0.3) !important; backdrop-filter: blur(8px);' : (link.bgColor ? ('background: ' + link.bgColor + ' !important;') : '') %>"><div data-testid="NewLinkContainerInner" class="LinkContainer_LinkContainer__Kk5IQ grid">"""

new_nf = """<div data-testid="NewLinkContainer" id="574249245" data-sticker-anchor="link" data-is-featured="false" data-style-type="OUTLINE" data-layout="stack" data-corner-style="ROUNDED_NONE" data-shadow-type="SHADOW_NONE" class="group" tabindex="0" style="opacity:1;"><div data-testid="NewLinkContainerInner" class="LinkContainer_LinkContainer__Kk5IQ grid relative overflow-hidden rounded-[var(--button-style-inner-radius)] ring-[0.5px] ring-white/30 bg-[var(--button-style-background)] shadow-[--shadow-layered]" style="<%= link.transparent ? 'background: transparent !important; border: 1px solid rgba(255,255,255,0.4) !important; backdrop-filter: blur(8px);' : (link.bgColor ? ('background: ' + link.bgColor + ' !important;') : '') %>">"""

if old_nf in content:
    content = content.replace(old_nf, new_nf)
    print("Non-featured links fixed!")
else:
    print("ERROR: old_nf not found!")
    sys.exit(1)

with open('views/index.ejs', 'w') as f:
    f.write(content)
