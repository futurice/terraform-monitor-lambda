#!/bin/bash

set -e # exit on error
PATH="$PATH:./node_modules/.bin" # allows us to run "npm binaries"

WORK_DIR="dist"
BUILD_ZIP="$WORK_DIR/lambda.zip" # note: this has to match what's in package.json
OK="\033[1;32mOK\033[0m"

echo -n "Checking for clean working copy... "
git diff-index HEAD
echo -e "$OK"

echo -n "Parsing git remote... "
github_raw="$(git config --get remote.origin.url | sed 's/.*://' | sed 's/\..*//')" # e.g. "git@github.com:user/project.git" => "user/project"
github_user="$(echo "$github_raw" | cut -d / -f 1)"
github_project="$(echo "$github_raw" | cut -d / -f 2)"
if [[ ! "$github_user" =~ ^[[:alnum:]-]+$ ]]; then
  echo -e "ERROR\n\nCan't seem to determine GitHub user name reliably: \"$github_user\""
  exit 1
fi
if [[ ! "$github_project" =~ ^[[:alnum:]-]+$ ]]; then
  echo -e "ERROR\n\nCan't seem to determine GitHub project name reliably: \"$github_project\""
  exit 1
fi
echo -e "$OK"

echo -n "Verifying GitHub API access... "
github_test="$(curl -s -n -o /dev/null -w "%{http_code}" https://api.github.com/user)"
if [ "$github_test" != "200" ]; then
  echo -e "ERROR\n\nPlease ensure that:"
  echo "* You've set up a Personal access token for the GitHub API (https://github.com/settings/tokens/new)"
  echo "* The resulting token is listed in your ~/.netrc file (under \"machine api.github.com\" and \"machine uploads.github.com\")"
  exit 1
fi
echo -e "$OK"

echo -n "Running pre-release QA tasks... "
npm run lint > /dev/null
echo -e "$OK"

echo -n "Building Lambda function... "
npm run build > /dev/null
echo -e "$OK"

echo
echo -n "This release is major/minor/patch: "
read version_bump
echo

echo -n "Committing and tagging new release... "
version_tag="$(npm version -m "Release %s" "$version_bump")"
echo -e "$OK"

echo -n "Pushing tag to GitHub... "
git push --quiet origin "$version_tag"
echo -e "$OK"

release_zip="$github_project-$version_tag.zip"
echo -n "Renaming release zipfile... "
mv "$BUILD_ZIP" "$WORK_DIR/$release_zip"
echo -e "$OK"

echo -n "Creating release on GitHub... " # https://developer.github.com/v3/repos/releases/
curl -o curl-out -s -n -X POST "https://api.github.com/repos/$github_user/$github_project/releases" --data "{\"tag_name\":\"$version_tag\"}"
release_upload_url="$(cat curl-out | node -p 'JSON.parse(fs.readFileSync(0)).upload_url' | sed 's/{.*//')"
release_html_url="$(cat curl-out | node -p 'JSON.parse(fs.readFileSync(0)).html_url')"
if [[ ! "$release_upload_url" =~ ^https:// ]]; then
  echo ERROR
  cat curl-out
  exit 1
fi
echo -e "$OK"

echo -n "Uploading release zipfile... "
release_upload_result="$(curl -o /dev/null -w "%{http_code}" -s -n "$release_upload_url?name=$release_zip" --data-binary @"$WORK_DIR/$release_zip" -H "Content-Type: application/octet-stream")"
if [ "$release_upload_result" != "201" ]; then
  echo -e "ERROR\n\nRelease upload gave unexpected HTTP status: \"$release_upload_result\""
  exit 1
fi
echo -e "$OK"

echo -n "Cleaning up... "
rm curl-out
echo -e "$OK"

echo
echo "New release: $release_html_url"
echo
