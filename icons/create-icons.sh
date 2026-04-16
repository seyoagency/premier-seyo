#!/bin/bash
# Basit PNG ikonlar olustur (ImageMagick ile)
# Dark ikon (acik renk, koyu temada kullanilir)
convert -size 23x23 xc:transparent -fill "#e0e0e0" -draw "roundrectangle 2,2 20,20 3,3" -fill "#1e1e1e" -font Helvetica -pointsize 10 -gravity center -draw "text 0,0 'PC'" /Users/seyo/Projects/premiere-cut/icons/icon-dark.png 2>/dev/null

# Light ikon (koyu renk, acik temada kullanilir)
convert -size 23x23 xc:transparent -fill "#333333" -draw "roundrectangle 2,2 20,20 3,3" -fill "#ffffff" -font Helvetica -pointsize 10 -gravity center -draw "text 0,0 'PC'" /Users/seyo/Projects/premiere-cut/icons/icon-light.png 2>/dev/null
