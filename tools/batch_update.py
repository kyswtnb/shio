
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
    "XS": "青森",
    "XO": "石川",
    "ZG": "福井",
    "MJ": "東京",
    "QP": "東京",
    "J9": "山口",
    "SB": "岡山",
    "MS": "熊本",
    "SH": "青森",
    "J8": "香川",
    "YJ": "沖縄",
    "RZ": "新潟",
    "QI": "鹿児島",
    "NK": "沖縄",
    "KS": "和歌山",
    "XT": "岩手",
    "ZH": "高知",
    "YK": "神奈川",
    "SD": "宮城",
    "ZL": "兵庫",
    "Z3": "静岡",
    "XQ": "富山",
    "QD": "長崎",
    "X5": "大分",
    "QQ": "東京",
    "O5": "熊本",
    "HG": "青森",
    "UC": "福井",
    "BP": "大分",
    "ZF": "千葉",
    "QL": "千葉",
    "CB": "千葉",
    "QK": "静岡",
    "DJ": "沖縄",
    "HR": "山口",
    "MC": "東京",
    "QF": "福岡",
    "QE": "長崎",
    "KT": "長崎",
    "QJ": "鹿児島",
    "Q9": "広島",
    "WY": "和歌山",
    "KA": "佐賀",
    "TS": "高知",
    "SI": "大阪",
    "SG": "宮城",
    "SK": "鳥取",
    "TX": "香川",
    "QC": "大分",
    "OH": "山口",
    "QG": "鹿児島",
    "OU": "佐賀",
    "O6": "福岡",
    "OF": "岩手",
    "O9": "鹿児島",
    "UW": "愛媛",
    "WH": "山口",
    "UN": "岡山",
    "MU": "高知",
    "MY": "岩手",
    "MG": "宮崎",
    "TY": "富山",
    "O1": "長崎",
    "ON": "福島",
    "ZN": "新潟",
    "KM": "徳島",
    "AM": "兵庫",
    "OK": "東京",
    "KW": "神奈川",
    "MR": "千葉",
    "X2": "長崎",
    "Q8": "広島",
    "A1": "山口",
    "OM": "静岡",
    "QA": "山口",
    "X6": "鹿児島",
    "XM": "福井",
    "NI": "愛媛",
    "SN": "富山",
    "I5": "新潟",
    "HW": "徳島",
    "AK": "兵庫",
    "KZ": "千葉",
    "HS": "熊本",
    "HM": "神奈川",
    "MT": "愛媛",
    "MK": "鹿児島",
    "ZC": "新潟",
    "QS": "神奈川",
    "QN": "神奈川",
    "O7": "熊本",
    "MM": "岡山",
    "EI": "兵庫",
    "F3": "北海道",
    "ZO": "沖縄",
    "Z1": "神奈川",
    "AB": "宮崎",
    "IO": "大阪",
    "T6": "兵庫",
    "ST": "兵庫",
    "ZA": "青森",
    "UR": "和歌山",
    "Z9": "和歌山",
    "TN": "大阪",
    "FK": "青森",
    "SM": "静岡",
    "D8": "神奈川",
    "Z5": "静岡",
    "KU": "熊本",
    "KN": "三重",
    "CC": "東京",
    "SU": "高知",
    "I7": "富山",
    "TI": "山口",
    "Z4": "静岡",
    "ZE": "鳥取",
    "ZI": "秋田",
    "SR": "和歌山",
    "KO": "山口",
    "T3": "新潟",
    "ZM": "福島",
    "IS": "沖縄",
    "E6": "宮城",
    "IK": "北海道",
    "KB": "兵庫",
    "QO": "東京",
    "FE": "長崎",
    "TJ": "鹿児島",
    "TH": "広島",
    "QR": "新潟",
    "IZ": "広島",
    "Z6": "宮崎",
    "SZ": "石川",
    "MI": "静岡",
    "MZ": "京都",
    "O3": "福岡",
    "QH": "鹿児島",
    "IJ": "沖縄",
    "SA": "島根",
    "I4": "愛知",
    "Z7": "石川",
    "NH": "沖縄",
    "X3": "長崎",
    "S9": "山形",
    "Q6": "岩手",
    "CS": "千葉",
    "NS": "長崎",
    "CF": "山口",
    "MO": "福岡",
    "KK": "大阪",
    "ZJ": "鹿児島",
    "AX": "佐賀",
    "AO": "青森",
    "AH": "福岡",
    "ZK": "山口",
    "V7": "高知",
    "ZQ": "山形",
    "TT": "千葉",
    "TA": "香川",
    "KC": "高知",
    "ZD": "愛知",
    "AY": "宮城",
    "TB": "三重",
    "KG": "鹿児島",
    "ZB": "山形",
    "N5": "長崎",
    "N1": "福岡",
    "G5": "愛知",
    "K1": "兵庫",
    "RH": "熊本",
    "K5": "山口",
    "HK": "北海道",
    "B1": "北海道",
    "Q0": "北海道",
    "B4": "青森",
    "ZP": "北海道",
    "OR": "北海道",
    "A8": "北海道",
    "B6": "北海道",
    "B3": "北海道",
    "OW": "三重",
    "B5": "北海道",
    "Z8": "北海道",
    "A5": "北海道",
    "KE": "北海道",
    "NM": "北海道",
    "A3": "北海道",
    "ES": "北海道",
    "A9": "北海道",
    "SE": "北海道",
    "B2": "北海道",
    "SO": "北海道",
    "WN": "北海道",
    "A0": "北海道",
    "AS": "北海道",
    "A6": "北海道",
    "HN": "北海道",
    "C8": "北海道",
    "TM": "北海道",
    "KR": "北海道",
    "KP": "北海道",
    "OS": "大阪",
    "J2": "大阪",
    "J6": "徳島",
    "J5": "兵庫",
    "M0": "愛媛",
    "D6": "静岡",
    "D4": "東京",
    "D3": "茨城",
    "D1": "茨城",
    "D2": "茨城",
    "M1": "愛媛",
    "M3": "愛媛",
    "NG": "愛知",
    "N0": "福岡",
    "R1": "沖縄",
    "T2": "京都",
    "TK": "東京",
    "T1": "石川",
    "LG": "岡山",
    "L6": "高知",
    "OD": "神奈川",
    "G4": "愛知",
    "G3": "三重",
    "Q2": "青森",
    "L0": "愛媛",
    "GB": "和歌山",
    "G9": "静岡",
    "G8": "愛知",
    "H1": "和歌山",
    "HA": "島根",
    "Q1": "青森",
    "AW": "徳島",
    "S0": "新潟",
    "S6": "新潟",
    "S1": "秋田",
    "S2": "秋田",
    "L8": "愛媛",
    "L7": "高知"
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
