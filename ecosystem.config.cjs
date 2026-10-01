// pm2 process for the live site. Env (ADMIN_EMAIL, ADMIN_PASSWORD) lives in /var/www/learnworks/.env, not here.
module.exports = {
  apps: [{
    name: "learnworks",
    cwd: "/var/www/learnworks",
    script: "node_modules/next/dist/bin/next",
    args: "start -p 3091 -H 127.0.0.1",
    env: { NODE_ENV: "production" },
    max_memory_restart: "500M",
  }],
};
