#!/bin/sh
# Source this in a publishing step:  . scripts/ci/git-token-auth.sh
#
# Hands $GIT_TOKEN to every git command of the step as an HTTP header, through git's
# environment configuration (GIT_CONFIG_COUNT/KEY/VALUE, git >= 2.31). The token is never part of
# a URL, never written to the clone's .git/config, and its base64 form is masked in the job log.
# Only the step that sources this file ever sees the token: the jobs keep the secret in that
# step's `env`, not the job's.
: "${GIT_TOKEN:?GIT_TOKEN is not set}"
_auth="$(printf 'x-access-token:%s' "$GIT_TOKEN" | base64 | tr -d '\n')"
echo "::add-mask::$_auth"
export GIT_CONFIG_COUNT=1
export GIT_CONFIG_KEY_0="http.https://github.com/.extraheader"
export GIT_CONFIG_VALUE_0="AUTHORIZATION: basic $_auth"
unset _auth
