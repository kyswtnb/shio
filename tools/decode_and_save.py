import base64
import gzip
import json
import os

INPUT_FILE = "../data/tide_2026.b64"
OUTPUT_FILE = "../data/tide_2026.json"

import sys

def main():
    try:
        if len(sys.argv) < 3:
            print("Usage: python3 decode_and_save.py <input.b64> <output.json>")
            return

        input_path = sys.argv[1]
        output_path = sys.argv[2]

        print(f"Reading from {input_path}...")
        with open(input_path, 'r') as f:
            b64_data = f.read().strip()

        print("Decoding Base64...")
        compressed_data = base64.b64decode(b64_data)

        print("Decompressing GZIP...")
        json_bytes = gzip.decompress(compressed_data)
        json_str = json_bytes.decode('utf-8')

        # Verify JSON
        data = json.loads(json_str)
        print(f"Successfully decoded JSON. Keys: {list(data.keys())}")

        print(f"Saving to {output_path}...")
        with open(output_path, 'w') as f:
            f.write(json_str)
        
        print("Done.")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
