
import os
import json
import urllib.request
import urllib.error
import re
from parse_jma_txt import parse_line

STATION_LIST_URL = "https://www.data.jma.go.jp/kaiyou/db/tide/suisan/station.php"
BASE_DATA_URL = "https://www.data.jma.go.jp/kaiyou/data/db/tide/suisan/txt/2026/{code}.txt"

DATA_TXT_DIR = "data/raw_txt"
DATA_JSON_DIR = "data/raw"

def get_html(url):
    try:
        with urllib.request.urlopen(url, timeout=20) as response:
            return response.read().decode('utf-8', errors='replace')
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return None

# Mapping some common station code prefixes or specific codes to regions/prefectures
# This ensures reliability even if scraping the rowspan cells fails.
REGION_MAP = {
    "WN": "北海道", "KE": "北海道", "A0": "北海道", "AS": "北海道", "A6": "北海道", "NM": "北海道",
    "HN": "北海道", "KP": "北海道", "KR": "北海道", "B1": "北海道", "A9": "北海道", "C8": "北海道",
    "TM": "北海道", "SO": "北海道", "A8": "北海道", "A3": "北海道", "HK": "北海道", "Q0": "北海道",
    "A5": "北海道", "ES": "北海道", "ZP": "北海道", "OR": "北海道", "SE": "北海道", "B6": "北海道",
    "B5": "北海道", "Z8": "北海道", "B3": "北海道", "OW": "北海道", "B4": "北海道", "B2": "北海道",
    "HA": "青森", "H1": "青森", "H0": "青森", "H9": "青森", "HC": "青森", "H2": "青森", "H3": "青森",
    "H5": "青森", "AW": "青森", "H4": "青森", "D0": "岩手", "D1": "岩手", "D2": "岩手", "D3": "岩手",
    "D4": "岩手", "D5": "岩手", "D6": "岩手", "E0": "宮城", "E1": "宮城", "E2": "宮城", "E3": "宮城",
    "E4": "宮城", "F0": "福島", "F1": "福島", "I0": "茨城", "I1": "茨城", "C0": "千葉", "C1": "千葉",
    "C2": "千葉", "C3": "千葉", "C4": "千葉", "C5": "千葉", "TK": "東京", "T0": "東京", "T1": "東京",
    "T2": "東京", "Y0": "神奈川", "Y1": "神奈川", "OD": "神奈川", "S0": "静岡", "S1": "静岡", "S2": "静岡",
    "S3": "静岡", "S4": "静岡", "S5": "静岡", "S6": "静岡", "S7": "静岡", "NG": "愛知", "N0": "愛知",
    "N1": "三重", "N2": "三重", "N3": "三重", "N4": "三重", "N5": "三重", "W0": "和歌山", "W1": "和歌山",
    "W2": "和歌山", "W3": "和歌山", "OS": "大阪", "K0": "兵庫", "K1": "兵庫", "K2": "兵庫", "K3": "兵庫",
    "K4": "兵庫", "K5": "兵庫", "K6": "兵庫", "K7": "兵庫", "K8": "兵庫", "K9": "兵庫", "U0": "徳島",
    "U1": "徳島", "U2": "徳島", "U3": "香川", "U4": "香川", "U5": "愛媛", "U6": "愛媛", "U7": "愛媛",
    "U8": "愛媛", "U9": "愛媛", "V0": "高知", "V1": "高知", "V2": "高知", "V3": "高知", "V4": "高知",
    "V5": "高知", "M0": "岡山", "M1": "広島", "M2": "広島", "M3": "広島", "J0": "山口", "J1": "山口",
    "J2": "山口", "J3": "山口", "J4": "山口", "J5": "山口", "J6": "山口", "J7": "山口", "G0": "福岡",
    "G1": "福岡", "G2": "福岡", "G3": "福岡", "G4": "福岡", "G5": "佐賀", "G6": "佐賀", "G7": "長崎",
    "G8": "長崎", "G9": "長崎", "GA": "長崎", "GB": "長崎", "GC": "長崎", "GD": "長崎", "L0": "長崎",
    "L1": "長崎", "L3": "熊本", "L4": "熊本", "L5": "熊本", "L6": "熊本", "L7": "鹿児島", "L8": "鹿児島",
    "L9": "鹿児島", "LA": "鹿児島", "LB": "鹿児島", "LC": "鹿児島", "LD": "鹿児島", "LE": "鹿児島",
    "LF": "沖縄", "LG": "沖縄", "LH": "沖縄", "LI": "沖縄", "LJ": "沖縄", "LK": "沖縄", "LL": "沖縄",
    "LM": "沖縄", "LN": "沖縄", "LO": "沖縄", "LP": "沖縄", "P0": "大分", "P1": "大分", "P2": "大分",
    "P3": "宮崎", "P4": "宮崎", "P5": "宮崎", "P6": "福岡", "P7": "福岡", "P8": "山口", "Q1": "青森",
    "Q2": "秋田", "Q3": "秋田", "Q4": "山形", "Q5": "山形", "R0": "新潟", "R1": "新潟", "R2": "新潟",
    "R3": "新潟", "R4": "新潟", "R5": "新潟", "R6": "富山", "R7": "富山", "R8": "石川", "R9": "石川",
    "RA": "石川", "RB": "石川", "RC": "福井", "RD": "福井", "RE": "福井", "RF": "京都", "RG": "京都",
    "RH": "兵庫", "RI": "兵庫", "RJ": "鳥取", "RK": "鳥取", "RL": "島根", "RM": "島根", "RN": "島根",
    "RO": "島根", "RP": "山口", "RQ": "山口"
}

def get_pref_for_code(code):
    # Try direct match
    if code in REGION_MAP:
        return REGION_MAP[code]
    # Handle sub-codes or patterns if necessary
    return "その他"

def scrape_stations():
    print(f"Scraping stations from {STATION_LIST_URL}...")
    html = get_html(STATION_LIST_URL)
    if not html:
        return []
    
    stations_map = {}
    
    # Track current prefecture from table if possible, but use map as backup
    current_pref_from_table = "不明"
    
    # Search for links like: suisan.php?stn=WN&...
    # This is more reliable than table rows which have complex rowspans.
    links = re.findall(r'suisan\.php\?stn=([A-Z0-9]{2})[^>]*>(.*?)</a>', html)
    for code, name in links:
        name = name.strip()
        if code and name and name != "潮汐表":
            pref = get_pref_for_code(code)
            stations_map[code] = {"code": code, "name": name, "pref": pref}

    stations = list(stations_map.values())
    # Sort by prefecture then name
    stations.sort(key=lambda x: (x['pref'], x['name']))
    
    print(f"Found {len(stations)} stations.")
    return stations

def download_data(code):
    url = BASE_DATA_URL.format(code=code)
    try:
        with urllib.request.urlopen(url, timeout=10) as response:
            if response.status == 200:
                content = response.read().decode('utf-8', errors='replace')
                path = os.path.join(DATA_TXT_DIR, f"{code}.txt")
                with open(path, 'w', encoding='utf-8') as f:
                    f.write(content)
                return True
    except urllib.error.HTTPError as e:
        print(f"HTTP Error for {code}: {e.code}")
    except Exception as e:
        print(f"Exception downloading {code}: {e}")
    return False

def process_all_stations(stations):
    os.makedirs(DATA_TXT_DIR, exist_ok=True)
    os.makedirs(DATA_JSON_DIR, exist_ok=True)
    
    processed_stations = []
    
    for i, st in enumerate(stations):
        code = st['code']
        name = st['name']
        print(f"[{i+1}/{len(stations)}] Processing {name} ({code})...")
        
        if download_data(code):
            txt_path = os.path.join(DATA_TXT_DIR, f"{code}.txt")
            json_path = os.path.join(DATA_JSON_DIR, f"{code}.json")
            
            data = []
            try:
                with open(txt_path, 'r', encoding='utf-8') as f:
                    for line in f:
                        parsed = parse_line(line)
                        if parsed:
                            data.append(parsed)
                
                if data:
                    with open(json_path, 'w', encoding='utf-8') as f:
                        json.dump(data, f, ensure_ascii=False, indent=2)
                    processed_stations.append(st)
                else:
                    print(f"Warning: No data parsed for {code}")
            except Exception as e:
                print(f"Error processing {code}: {e}")
        
    return processed_stations

if __name__ == "__main__":
    stations = scrape_stations()
    if stations:
        os.makedirs('data', exist_ok=True)
        with open('data/stations.json', 'w', encoding='utf-8') as f:
            json.dump(stations, f, ensure_ascii=False, indent=2)
            
        print("Starting batch processing...")
        process_all_stations(stations)
        print("Batch processing complete.")
    else:
        print("No stations found. Check the regex or URL.")
        import sys
        sys.exit(1)
