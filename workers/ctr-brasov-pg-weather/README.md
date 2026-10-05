# ctr-brasov-pg-weather

Worker Cloudflare pentru stațiile Paragliding România și istoricul PG în D1.

Țintă de arhitectură:
- `/stations` citește valorile curente direct online, fără D1.
- cron la 10 minute scrie valori noi în D1.
- `/history?station=...` citește D1 numai la cererea utilizatorului.
