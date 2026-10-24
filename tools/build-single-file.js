// Builds dist/cpu-scheduler-single.html: index.html with scheduler.js inlined (one portable file).
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'scheduler.js'), 'utf8');
const out = html.replace('<script src="scheduler.js"></script>', () => '<script>\n' + js + '\n</script>');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'cpu-scheduler-single.html'), out);
// Artifact variant: page body only (the host supplies doctype/head/body).
const art = out.replace(/<!doctype html>\s*<html[^>]*>\s*<head>/i, '').replace(/<meta charset[^>]*>\s*<meta name="viewport"[^>]*>\s*/i, '')
  .replace(/<\/head>\s*<body>/i, '').replace(/<\/body>\s*<\/html>\s*$/i, '');
fs.writeFileSync(process.argv[2] || path.join(root, 'dist', 'artifact.html'), art);
console.log('built');
