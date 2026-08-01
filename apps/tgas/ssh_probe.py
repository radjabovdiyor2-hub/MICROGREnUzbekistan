import os
import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

client.connect(
    os.getenv("DEPLOY_HOST", "82.115.50.30"),
    username=os.getenv("DEPLOY_USER", "ubuntu"),
    password=os.getenv("DEPLOY_PASS"),
)

cmd = "pm2 list"
stdin, stdout, stderr = client.exec_command(cmd)
out = stdout.read()
with open("pm2.txt", "w", encoding="utf-8") as f:
    f.write(out.decode("utf-8", "ignore"))
client.close()
