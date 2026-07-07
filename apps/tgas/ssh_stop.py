import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect("82.115.50.30", username="ubuntu", password="eddogvjzfdug&wAjugg5")

cmd = "pm2 stop oltin-baliq"
stdin, stdout, stderr = client.exec_command(cmd)
client.close()
