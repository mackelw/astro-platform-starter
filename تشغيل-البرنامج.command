#!/usr/bin/env bash
# تشغيل سيرفر مركز رينج على هذا الجهاز (ماك / لينكس) — انقر نقرًا مزدوجًا
set -e
cd "$(dirname "$0")"

export PORT="${PORT:-4321}"
export HOST="${HOST:-0.0.0.0}"   # 0.0.0.0 حتى تفتح بقية أجهزة الشبكة على هذا الجهاز

echo "== مركز رينج للعلاج الطبيعي والتأهيل =="

if ! command -v node > /dev/null 2>&1; then
    echo "لم يتم العثور على Node.js."
    echo "نزّله من https://nodejs.org (نسخة LTS) ثم شغّل هذا الملف مرة أخرى."
    read -r -p "اضغط Enter للإغلاق..."
    exit 1
fi

if [ ! -d node_modules ]; then
    echo "تجهيز البرنامج لأول مرة (قد يستغرق دقائق)…"
    npm install
fi

if [ ! -f dist/server/entry.mjs ]; then
    echo "بناء النسخة النهائية…"
    npm run build:server
fi

# عنوان الجهاز على الشبكة المحلية ليفتح منه الموبايل وباقي الأجهزة
IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')"

echo ""
echo "البرنامج شغال. افتح:"
echo "  برنامج الموظفين : http://localhost:$PORT/app"
echo "  موقع المركز     : http://localhost:$PORT"
[ -n "$IP" ] && echo "  من الموبايل     : http://$IP:$PORT/app   (على نفس شبكة الواي فاي)"
echo ""
echo "لإيقاف البرنامج: أغلق هذه النافذة أو اضغط Ctrl+C"
echo ""

# يفتح شاشة الموظفين مباشرة — الجذر صار موقع المركز العام
(sleep 2; (open "http://localhost:$PORT/app" 2>/dev/null || xdg-open "http://localhost:$PORT/app" 2>/dev/null || true)) &
npm run start:server
