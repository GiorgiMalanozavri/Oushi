# Gmail Push (real-time labels): GCP setup

The code shipped in this repo expects three env vars and one Pub/Sub
subscription. Once they're configured, new emails get labeled in Gmail
within seconds of arrival instead of waiting for the next rank.

## What you'll set up

1. A Pub/Sub topic in your Google Cloud project
2. IAM permission letting Gmail publish to it
3. A push subscription pointing to `/api/gmail/push`
4. OIDC authentication on the push (so the webhook can verify the caller is Pub/Sub)

## Steps

### 1. Pick a Google Cloud project

Use the same project your Gmail OAuth client lives in. If you don't have one yet, create it via https://console.cloud.google.com/.

```
PROJECT=oushi-prod           # whatever you named it
TOPIC=gmail-push
```

### 2. Enable the Pub/Sub API

```
gcloud services enable pubsub.googleapis.com --project=$PROJECT
```

### 3. Create the topic

```
gcloud pubsub topics create $TOPIC --project=$PROJECT
```

### 4. Grant Gmail permission to publish

Gmail's service account is `gmail-api-push@system.gserviceaccount.com`. Grant it `roles/pubsub.publisher` on the topic:

```
gcloud pubsub topics add-iam-policy-binding $TOPIC \
  --member='serviceAccount:gmail-api-push@system.gserviceaccount.com' \
  --role='roles/pubsub.publisher' \
  --project=$PROJECT
```

### 5. Create a service account for the push subscription

Pub/Sub will sign OIDC tokens with this SA when calling your webhook. The webhook verifies them.

```
SA=oushi-push
gcloud iam service-accounts create $SA \
  --display-name="Oushi Pub/Sub push" \
  --project=$PROJECT

# Note the email: $SA@$PROJECT.iam.gserviceaccount.com
```

You also need to grant `iam.serviceAccountTokenCreator` on this SA to the Pub/Sub service agent so it can mint tokens:

```
PROJECT_NUM=$(gcloud projects describe $PROJECT --format="value(projectNumber)")
PUBSUB_SA=service-$PROJECT_NUM@gcp-sa-pubsub.iam.gserviceaccount.com

gcloud iam service-accounts add-iam-policy-binding \
  $SA@$PROJECT.iam.gserviceaccount.com \
  --member="serviceAccount:$PUBSUB_SA" \
  --role="roles/iam.serviceAccountTokenCreator" \
  --project=$PROJECT
```

### 6. Create the push subscription

Replace `https://app.oushi.com` with your actual deployment URL.

```
WEBHOOK=https://app.oushi.com/api/gmail/push

gcloud pubsub subscriptions create gmail-push-sub \
  --topic=$TOPIC \
  --push-endpoint=$WEBHOOK \
  --push-auth-service-account=$SA@$PROJECT.iam.gserviceaccount.com \
  --push-auth-token-audience=$WEBHOOK \
  --ack-deadline=60 \
  --project=$PROJECT
```

### 7. Set the env vars in your deployment

```
GMAIL_PUSH_TOPIC=projects/$PROJECT/topics/$TOPIC
GMAIL_PUSH_AUDIENCE=https://app.oushi.com/api/gmail/push
GMAIL_PUSH_SA=oushi-push@$PROJECT.iam.gserviceaccount.com
```

Set `GMAIL_PUSH_AUDIENCE` to the exact URL Pub/Sub will call. It must match `--push-auth-token-audience` above.

### 8. Add the cron job

Gmail watches expire after 7 days. The refresh cron handles it. Add to `vercel.json` (or your scheduler):

```json
{
  "crons": [
    { "path": "/api/cron/gmail-watch-refresh", "schedule": "0 4 * * *" }
  ]
}
```

## Verification

1. Run `supabase/migrations/023_gmail_push.sql` in your database.
2. Click **Apply labels** in Settings once. The route registers a Gmail watch automatically. You should see a row in `user_sync_state` with non-null `gmail_email`, `gmail_watch_expires_at`, and `gmail_pubsub_topic`.
3. Send yourself an email. Within a few seconds, the Oushi label should appear on it in Gmail.

## What happens if you don't set this up

Everything still works, labels just get applied on the slower
rank-driven schedule (next dashboard refresh). The `registerGmailWatch`
call is a no-op when `GMAIL_PUSH_TOPIC` is missing.
