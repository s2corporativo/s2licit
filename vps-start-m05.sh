#!/bin/bash
sshpass -p 'Fam04061427@' ssh -o ConnectTimeout=20 root@13.140.167.153 "chmod +x /tmp/vps-apply-m05.sh && nohup bash /tmp/vps-apply-m05.sh > /tmp/s2-m05.log 2>&1 & echo started=\$!"
