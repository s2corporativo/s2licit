const fs = require("fs");
const path = process.argv[2] || "/opt/s2licit/.env";
const env = Object.fromEntries(
  fs.readFileSync(path, "utf8").split("\n")
    .filter(l => l && l[0] !== "#")
    .map(l => l.split(/=(.*)/s)),
);
console.log("host:", env.IMAP_HOST, "| user:", env.IMAP_USER ? env.IMAP_USER.split("@")[0] + "@..." : "(vazio)", "| pwd-set:", Boolean(env.IMAP_PASSWORD));
if (!env.IMAP_HOST || !env.IMAP_USER || !env.IMAP_PASSWORD) { console.log("IMAP_NAO_CONFIGURADO"); process.exit(0); }
const tls = require("tls");
const c = tls.connect(993, env.IMAP_HOST, { rejectUnauthorized: false });
let resp = "";
c.on("secureConnect", () => {});
c.on("data", d => {
  resp += d.toString();
  if (!c._loggedIn && resp.includes("\r\n") && resp.length > 30) {
    c._loggedIn = true;
    c.write(`a1 LOGIN ${JSON.stringify(env.IMAP_USER)} ${JSON.stringify(env.IMAP_PASSWORD)}\r\n`);
  }
  if (resp.includes("a1 OK")) {
    c.write('a2 LIST "" "*"\r\n');
  }
  if (resp.includes("a2 ")) {
    const folders = resp.split("\r\n")
      .filter(l => l.includes("LIST ("))
      .map(l => { const m = l.match(/\{?[^"]*"?([^"]*)"?$/); return m ? m[1] : null; })
      .filter(Boolean);
    console.log("LOGIN: OK | PASTAS:", folders.slice(0, 12).join(", "));
    c.write("a3 LOGOUT\r\n");
    c.destroy();
    process.exit(0);
  }
  if (resp.match(/a1 (NO|BAD|BYE)/)) {
    console.log("LOGIN: FALHOU", resp.split("\r\n").filter(l => l.startsWith("a1 ")).join(" | ").slice(0, 150));
    c.destroy();
    process.exit(2);
  }
});
c.on("error", e => { console.log("ERRO:", e.message); process.exit(2); });
c.setTimeout(20000, () => { console.log("TIMEOUT"); c.destroy(); process.exit(2); });
