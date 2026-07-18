import cv2

def annotate_image(img, koordinat_kotak, label_prefix="Orang"):
    """
    Menggambar bounding box dan banner label pada gambar berdasarkan koordinat ternormalisasi.
    
    Parameters:
        img: np.ndarray (gambar BGR asli)
        koordinat_kotak: list of dict contaning "posisi" and "confidence"
        label_prefix: str, prefix label untuk bounding box (misalnya "Orang" atau "Gerakan")
    
    Returns:
        img_hasil: np.ndarray (gambar yang sudah dianotasi)
    """
    img_hasil = img.copy()
    height, width = img_hasil.shape[:2]

    for box in koordinat_kotak:
        x1_norm, y1_norm, x2_norm, y2_norm = box["posisi"]
        conf = box["confidence"]

        x1 = int(x1_norm * width)
        y1 = int(y1_norm * height)
        x2 = int(x2_norm * width)
        y2 = int(y2_norm * height)

        # Batasi koordinat agar tetap di dalam frame gambar
        x1 = max(0, min(x1, width - 1))
        y1 = max(0, min(y1, height - 1))
        x2 = max(0, min(x2, width - 1))
        y2 = max(0, min(y2, height - 1))

        # Bounding Box merah
        cv2.rectangle(img_hasil, (x1, y1), (x2, y2), (0, 0, 255), 3)

        # Banner teks label
        if label_prefix == "Gerakan":
            label = "Gerakan"
        else:
            label = f"{label_prefix}: {int(conf * 100)}%"
            
        (text_w, text_h), baseline = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 2)
        y_banner_top = max(y1 - text_h - 10, 0)
        y_banner_bottom = max(y1, text_h + 10)

        # Banner background merah di atas bounding box
        cv2.rectangle(img_hasil, (x1, y_banner_top), (x1 + text_w + 4, y_banner_bottom), (0, 0, 255), cv2.FILLED)
        
        # Teks label putih
        cv2.putText(img_hasil, label, (x1 + 2, y_banner_bottom - 4),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 2, cv2.LINE_AA)

    return img_hasil
