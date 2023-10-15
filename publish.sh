#!/bin/bash
set -e
npm run build
rsync -avz --exclude node_modules --exclude .git ./ badlogic@marioslab.io:/home/badlogic/skyview.social/app
ssh -t marioslab.io "cd skyview.social && SKYVIEW_BLUESKY_ACCOUNT=$SKYVIEW_BLUESKY_ACCOUNT SKYVIEW_BLUESKY_PASSWORD=$SKYVIEW_BLUESKY_PASSWORD ./reload.sh && docker-compose logs -f"
