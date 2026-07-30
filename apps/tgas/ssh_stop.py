import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
import os
client.connect(os.getenv("DEPLOY_HOST", "82.115.50.30"), username=os.getenv("DEPLOY_USER", "ubuntu"), password=os.getenv("DEPLOY_PASS"))

cmd = "pm2 stop oltin-baliq"
stdin, stdout, stderr = client.exec_command(cmd)
client.close()
