# Lager en minimal, gyldig PDF med én tekstlinje. Ingen tredjepartspakker.
# Brukes kun til bolletesten. Kjør: python test/make-test-pdf.py
import sys, zlib  # noqa

SECRET = "PDFBOLLE4231"
text = f"Kodeordet i denne PDF-en er {SECRET}."

# Innholdsstrom: skriv teksten med Helvetica.
content = f"BT /F1 24 Tf 72 720 Td ({text}) Tj ET".encode("latin-1")

objs = []
objs.append(b"<< /Type /Catalog /Pages 2 0 R >>")
objs.append(b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
objs.append(b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
            b"/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>")
objs.append(b"<< /Length " + str(len(content)).encode() + b" >>\nstream\n" + content + b"\nendstream")
objs.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")

pdf = b"%PDF-1.4\n"
offsets = []
for i, body in enumerate(objs, start=1):
    offsets.append(len(pdf))
    pdf += f"{i} 0 obj\n".encode() + body + b"\nendobj\n"

xref_pos = len(pdf)
pdf += f"xref\n0 {len(objs)+1}\n".encode()
pdf += b"0000000000 65535 f \n"
for off in offsets:
    pdf += f"{off:010d} 00000 n \n".encode()
pdf += (f"trailer\n<< /Size {len(objs)+1} /Root 1 0 R >>\n"
        f"startxref\n{xref_pos}\n%%EOF").encode()

out = sys.argv[1] if len(sys.argv) > 1 else "test/test.pdf"
with open(out, "wb") as f:
    f.write(pdf)
print(f"skrev {out} ({len(pdf)} bytes), kodeord {SECRET}")
