#!/usr/bin/env python3
import argparse
import json
import os
import sys
import time
import traceback

protocol_stdout = sys.stdout
sys.stdout = sys.stderr


def send(payload):
    protocol_stdout.write(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")
    protocol_stdout.flush()


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", choices=("tiny", "small"), default="tiny")
    parser.add_argument("--threads", type=int, default=2)
    parser.add_argument("--max-image-side", type=int, default=1600)
    parser.add_argument("--check", action="store_true")
    return parser.parse_args()


args = parse_args()
os.environ.setdefault("OMP_NUM_THREADS", str(args.threads))
os.environ.setdefault("OMP_THREAD_LIMIT", str(args.threads))

try:
    from rapidocr import EngineType, LangDet, LangRec, ModelType, OCRVersion, RapidOCR

    model_type = ModelType.TINY if args.model == "tiny" else ModelType.SMALL
    engine = RapidOCR(
        params={
            "Global.use_cls": False,
            "Global.max_side_len": args.max_image_side,
            "Global.log_level": "warning",
            "Det.engine_type": EngineType.ONNXRUNTIME,
            "Det.lang_type": LangDet.CH,
            "Det.model_type": model_type,
            "Det.ocr_version": OCRVersion.PPOCRV6,
            "Rec.engine_type": EngineType.ONNXRUNTIME,
            "Rec.lang_type": LangRec.CH,
            "Rec.model_type": model_type,
            "Rec.ocr_version": OCRVersion.PPOCRV6,
            "EngineConfig.onnxruntime.intra_op_num_threads": args.threads,
            "EngineConfig.onnxruntime.inter_op_num_threads": 1,
        }
    )
except Exception:
    traceback.print_exc(file=sys.stderr)
    raise

if args.check:
    send({"ok": True, "model": "PP-OCRv6_" + args.model})
    raise SystemExit(0)

for line in sys.stdin:
    request_id = None
    try:
        request = json.loads(line)
        request_id = request.get("id")
        if request.get("method") != "recognize":
            raise ValueError("unsupported method")
        image_path = request.get("imagePath")
        if not isinstance(image_path, str) or not image_path:
            raise ValueError("imagePath must be a non-empty string")

        started = time.perf_counter()
        output = engine(image_path)
        raw_blocks = output.to_json() or []
        blocks = [
            {
                "text": block["txt"],
                "confidence": float(block["score"]),
                "polygon": block["box"],
            }
            for block in raw_blocks
        ]
        send(
            {
                "id": request_id,
                "ok": True,
                "result": {
                    "text": "\n".join(block["text"] for block in blocks),
                    "blocks": blocks,
                    "metadata": {
                        "model": "PP-OCRv6_" + args.model,
                        "durationMs": round((time.perf_counter() - started) * 1000, 3),
                    },
                },
            }
        )
    except Exception as error:
        traceback.print_exc(file=sys.stderr)
        send(
            {
                "id": request_id,
                "ok": False,
                "error": {"code": "RECOGNITION_FAILED", "message": str(error)},
            }
        )
