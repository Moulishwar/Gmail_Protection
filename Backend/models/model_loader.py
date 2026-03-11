# models/model_loader.py — Load both ML models once at backend startup.

import logging

import torch
from transformers import (
    AutoTokenizer,
    AutoModelForSequenceClassification,
    BertTokenizerFast,
    BertForSequenceClassification,
    pipeline,
)

logger = logging.getLogger("backend")

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

_email_tokenizer = None
_email_model     = None
_url_pipeline    = None


def load_models() -> None:
    """Load both phishing detection models. Call once at application startup."""
    global _email_tokenizer, _email_model, _url_pipeline

    logger.info("Loading ML models on device: %s", DEVICE)

    email_model_name = "dima806/phishing-email-detection"
    logger.info("Loading email model: %s", email_model_name)
    _email_tokenizer = AutoTokenizer.from_pretrained(email_model_name)
    _email_model = AutoModelForSequenceClassification.from_pretrained(email_model_name)
    _email_model.to(DEVICE)
    _email_model.eval()
    logger.info("Email model loaded.")

    # ── URL model ──────────────────────────────────────────────────────────
    url_model_name = "CrabInHoney/urlbert-tiny-v4-phishing-classifier"
    logger.info("Loading URL model: %s", url_model_name)
    _url_tokenizer = BertTokenizerFast.from_pretrained(url_model_name)
    _url_model = BertForSequenceClassification.from_pretrained(url_model_name)
    _url_model.to(DEVICE)

    _url_pipeline = pipeline(
        "text-classification",
        model=_url_model,
        tokenizer=_url_tokenizer,
        device=0 if torch.cuda.is_available() else -1,
        top_k=None,             # return scores for all labels (replaces deprecated return_all_scores)
    )
    logger.info("URL model loaded.")

    logger.info("ML models loaded and ready.")


def get_email_model() -> tuple:
    """Return (tokenizer, model) for the email phishing detector."""
    if _email_tokenizer is None or _email_model is None:
        raise RuntimeError("Email model not loaded. Call load_models() at startup.")
    return _email_tokenizer, _email_model


def get_url_pipeline():
    """Return the URL phishing classification pipeline."""
    if _url_pipeline is None:
        raise RuntimeError("URL model not loaded. Call load_models() at startup.")
    return _url_pipeline
