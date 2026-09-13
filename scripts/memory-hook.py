#!/usr/bin/env python3
import sys
import json
import os

mode = sys.argv[1] if len(sys.argv) > 1 else "pre-invocation"

try:
    input_data = json.load(sys.stdin) if not sys.stdin.isatty() else {}
except Exception:
    input_data = {}

if mode == "pre-invocation":
    response = {
        "injectSteps": [
            {
                "ephemeralMessage": (
                    "[GZN MEMORIA HOOK] REGLA FUNDAMENTAL DE MISIÓN CRÍTICA: "
                    "Todo cambio de arquitectura, modelo de datos, endpoints, decisiones de seguridad "
                    "y estado de integración DEBE quedar documentado en MEMORIA.md. "
                    "Comprueba y mantén actualizada la memoria del proyecto en cada iteración."
                )
            }
        ]
    }
    print(json.dumps(response))
elif mode == "post-tool":
    print(json.dumps({}))
else:
    print(json.dumps({}))
