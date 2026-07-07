import httpx
import time
import asyncio

async def run_speedtest() -> dict:
    ping_url = "https://speed.cloudflare.com/cdn-cgi/trace"
    # Download 5MB to keep tests fast but accurate. 5MB = 5,000,000 bytes.
    download_url = "https://speed.cloudflare.com/__down?bytes=5000000"
    upload_url = "https://speed.cloudflare.com/__up"
    
    results = {"ping": 0.0, "download": 0.0, "upload": 0.0}
    
    # 1. Measure Ping (Latency)
    try:
        async with httpx.AsyncClient() as client:
            latencies = []
            for _ in range(3):
                t0 = time.perf_counter()
                r = await client.get(ping_url, timeout=5.0)
                t1 = time.perf_counter()
                if r.status_code == 200:
                    latencies.append((t1 - t0) * 1000.0)
            if latencies:
                results["ping"] = round(sum(latencies) / len(latencies), 2)
    except Exception as e:
        print("Speedtest ping error:", e)
        results["ping"] = 999.0
        
    # 2. Measure Download Speed
    try:
        async with httpx.AsyncClient() as client:
            t0 = time.perf_counter()
            r = await client.get(download_url, timeout=15.0)
            t1 = time.perf_counter()
            if r.status_code == 200:
                elapsed = t1 - t0
                bytes_downloaded = len(r.content)
                mbps = (bytes_downloaded * 8) / (elapsed * 1000000.0)
                results["download"] = round(mbps, 2)
    except Exception as e:
        print("Speedtest download error:", e)
        results["download"] = 0.0
        
    # 3. Measure Upload Speed
    try:
        # Upload 1MB payload to Cloudflare upload test endpoint
        payload = b"0" * 1000000
        async with httpx.AsyncClient() as client:
            t0 = time.perf_counter()
            r = await client.post(upload_url, content=payload, timeout=15.0)
            t1 = time.perf_counter()
            if r.status_code in (200, 204):
                elapsed = t1 - t0
                bytes_uploaded = len(payload)
                mbps = (bytes_uploaded * 8) / (elapsed * 1000000.0)
                results["upload"] = round(mbps, 2)
    except Exception as e:
        print("Speedtest upload error:", e)
        results["upload"] = 0.0
        
    return results
