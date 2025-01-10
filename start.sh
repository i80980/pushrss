#!/bin/sh
cd /app/backend && node server.js &
cd /app && serve -s dist -l 5173
wait