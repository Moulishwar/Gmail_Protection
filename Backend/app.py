from flask import Flask, request, jsonify
from flask_cors import CORS
import os, base64

app = Flask(__name__)
CORS(app)  # dev only; restrict in prod

os.makedirs("Attachments", exist_ok=True)

@app.route("/upload", methods=["POST"])
def upload():
    #print(f"Received request with data: {request.get_json()}")
    data = request.get_json(force=True)

    subject = data.get("subject","")
    sender  = data.get("from","")
    body    = data.get("body","")
    urls    = data.get("urls",[])
    atts    = data.get("attachments",[])

    # urls.txt
    with open("urls.txt", "w", encoding="utf-8") as f:
        for u in urls:
            f.write(u + "\n")

    # content.txt
    with open("content.txt", "w", encoding="utf-8") as f:
        f.write(f"From: {sender}\nSubject: {subject}\n\n{body}\n\n---\n")

    # Attachments/
    for a in atts:
        name = a.get("filename") or "attachment.bin"
        b64u = a.get("data") or ""
        try:
            raw = base64.urlsafe_b64decode(b64u.encode("utf-8"))
            with open(os.path.join("Attachments", name), "wb") as out:
                out.write(raw)
        except Exception as e:
            print("Attachment save failed:", e)

    return jsonify({"status":"ok","urls":len(urls),"attachments":len(atts)})

if __name__ == "__main__":
    app.run(port=5000, debug=True)
