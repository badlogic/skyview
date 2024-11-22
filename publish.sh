#!/bin/bash
set -e
npm run build
rsync -avz --exclude node_modules --exclude .git ./ badlogic@marioslab.io:/home/badlogic/skyview.social/app
cmd="export SKYVIEW_BLUESKY_ACCOUNT=$SKYVIEW_BLUESKY_ACCOUNT && export SKYVIEW_BLUESKY_PASSWORD=$SKYVIEW_BLUESKY_PASSWORD && export SKYVIEW_MEDIAMASK_KEY=$SKYVIEW_MEDIAMASK_KEY && ./reload.sh && docker-compose logs -f"
echo $cmd
ssh -t marioslab.io "cd skyview.social && $cmd"
