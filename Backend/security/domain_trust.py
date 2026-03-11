# security/domain_trust.py — Domain reputation layer.


# ── Trusted domain list ────────────────────────────────────────────────────

TRUSTED_DOMAINS: frozenset[str] = frozenset({
    "google.com",
    "youtube.com",
    "gmail.com",
    "github.com",
    "microsoft.com",
    "live.com",
    "outlook.com",
    "office.com",
    "linkedin.com",
    "apple.com",
    "icloud.com",
    "amazon.com",
    "aws.amazon.com",
    "openai.com",
    "dropbox.com",
    "substack.com",
    "slack.com",
    "zoom.us",
    "twitter.com",
    "x.com",
    "facebook.com",
    "instagram.com",
    "reddit.com",
    "stackoverflow.com",
    "wikipedia.org",
    "notion.so",
    "atlassian.com",
    "jira.atlassian.com",
    "confluence.atlassian.com",
    "stripe.com",
    "paypal.com",
    "shopify.com",
    "cloudflare.com",
    "netlify.com",
    "vercel.com",
    "heroku.com",
    "digitalocean.com",
    "fastly.com",
    "akamai.com",
    "hubspot.com",
    "salesforce.com",
    "twilio.com",
    "sendgrid.com",
    "mailchimp.com",
    "spotify.com",
    "netflix.com",
    "adobe.com",
    "oracle.com",
    "ibm.com",
    "docker.com",
    "kubernetes.io",
    "python.org",
    "pypi.org",
    "npmjs.com",
    "mozilla.org",
    "debian.org",
    "ubuntu.com",
    "fedoraproject.org",
})


TRUST_SCORE_MULTIPLIER: float = 0.3


def is_trusted_domain(domain: str) -> bool:
    """
    Return True if the domain (or any parent domain) is in the trusted set.

    Examples:
        accounts.google.com → True  (endswith google.com)
        mail.google.com     → True
        google.com.evil.ru  → False (suffix must be rightmost)
    """
    domain = domain.lower().lstrip("www.")
    for trusted in TRUSTED_DOMAINS:
        if domain == trusted or domain.endswith("." + trusted):
            return True
    return False
