import os
import json
import logging
import time
from google import genai
from google.genai import types

logging.basicConfig(level=logging.INFO, format="%(levelname)s - %(message)s")

# Initialize Gemini Client (Reads GEMINI_API_KEY from GitHub Secrets)
client = genai.Client()

CATEGORIES = [
    "Paper Mill / Fake Peer Review",
    "Data Fabrication / Manipulation",
    "Plagiarism / Text Recycling",
    "Image Manipulation",
    "Authorship / Ethics Dispute",
    "Publisher / Administrative Error",
    "Unspecified / Unknown"
]

def classify_retraction_reasons():
    filepath = os.path.join("data", "retractions.json")
    
    if not os.path.exists(filepath):
        logging.error(f"{filepath} not found. Run fetch_retractions.py first.")
        return

    with open(filepath, "r", encoding="utf-8") as f:
        articles = json.load(f)

    logging.info(f"Classifying articles using Gemini API...")

    # Process in small batches to optimize token usage and API limits
    batch_size = 20
    for i in range(0, len(articles), batch_size):
        batch = articles[i:i + batch_size]
        
        # Only process articles that haven't been classified yet
        unclassified = [
            {"index": idx, "title": art.get("title", ""), "publisher": art.get("publisher", "")}
            for idx, art in enumerate(batch) if "reason_category" not in art
        ]

        if not unclassified:
            continue

        prompt = f"""
        Analyze the following academic article titles and metadata. Classify the most likely cause/category for their retraction into EXACTLY ONE of these categories:
        {json.dumps(CATEGORIES)}

        Input items:
        {json.dumps(unclassified)}

        Return ONLY a valid JSON array of objects containing 'index' and 'reason_category'. Example:
        [{{"index": 0, "reason_category": "Paper Mill / Fake Peer Review"}}]
        """

        try:
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json"
                )
            )
            
            classifications = json.loads(response.text)
            for res in classifications:
                idx = res.get("index")
                if idx is not None and idx < len(batch):
                    batch[idx]["reason_category"] = res.get("reason_category", "Unspecified / Unknown")

            logging.info(f"Processed batch {i // batch_size + 1}")
            time.sleep(2) # Rate limit safety buffer

        except Exception as e:
            logging.error(f"Error classifying batch: {e}")
            for art in batch:
                if "reason_category" not in art:
                    art["reason_category"] = "Unspecified / Unknown"

    # Save enriched dataset back to the same JSON file
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(articles, f, ensure_ascii=False, separators=(',', ':'))
    logging.info("AI classification complete and dataset updated.")

if __name__ == "__main__":
    classify_retraction_reasons()
