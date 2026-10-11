    (() => {
      const $ = (id) => document.getElementById(id);
      const fileInput = $("file");
      const dropZone = $("drop");
      const widthInput = $("width");
      const contrastInput = $("contrast");
      const paletteSelect = $("palette");

      let source = null;
      let sourceName = "";
      let result = "";
      let resultSize = { columns: 0, rows: 0 };
      let zoom = 1;
      let panX = 0;
      let panY = 0;
      let dragStart = null;

      function setHint(message, isError = false) {
        const hint = $("hint");
        hint.textContent = message;
        hint.style.color = isError ? "var(--danger)" : "";
      }

      function formatFileSize(bytes) {
        return bytes < 1024 * 1024
          ? `${(bytes / 1024).toFixed(0)} KB`
          : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
      }

      function loadFile(file) {
        if (!file.type.startsWith("image/")) {
          setHint("Esse arquivo não parece ser uma imagem.", true);
          return;
        }

        if (file.size > 20 * 1024 * 1024) {
          setHint("A imagem precisa ter menos de 20 MB.", true);
          return;
        }

        const url = URL.createObjectURL(file);
        const image = new Image();

        image.onload = () => {
          if (source?.url) URL.revokeObjectURL(source.url);

          source = { image, url };
          sourceName = file.name;
          setZoom(1);
          $("fileMeta").textContent = `${file.name} · ${formatFileSize(file.size)} · ${image.naturalWidth} × ${image.naturalHeight}`;
          $("fileMeta").classList.add("show");
          $("convert").disabled = false;
          $("dimensions").textContent = `${image.naturalWidth} × ${image.naturalHeight} px`;

          setHint("Imagem pronta. Ajuste as opções e converta.");
          convertImage();
        };

        image.onerror = () => {
          URL.revokeObjectURL(url);
          setHint("Não foi possível abrir essa imagem.", true);
        };

        image.src = url;
      }

      function convertImage() {
        if (!source) return;

        const columns = Number(widthInput.value);
        const image = source.image;
        const rows = Math.max(
          1,
          Math.round((columns * image.naturalHeight / image.naturalWidth) * 0.48),
        );
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { willReadFrequently: true });

        canvas.width = columns;
        canvas.height = rows;
        context.drawImage(image, 0, 0, columns, rows);

        const pixels = context.getImageData(0, 0, columns, rows).data;
        const characters = paletteSelect.value;
        const invert = $("invert").checked;
        const contrast = 1 + Number(contrastInput.value) / 100;
        const lines = [];

        for (let y = 0; y < rows; y += 1) {
          let line = "";

          for (let x = 0; x < columns; x += 1) {
            const pixelIndex = (y * columns + x) * 4;
            const alpha = pixels[pixelIndex + 3] / 255;
            const luminance =
              (0.2126 * pixels[pixelIndex] +
                0.7152 * pixels[pixelIndex + 1] +
                0.0722 * pixels[pixelIndex + 2]) *
                alpha +
              255 * (1 - alpha);
            let brightness = ((luminance / 255 - 0.5) * contrast) + 0.5;
            brightness = Math.max(0, Math.min(1, brightness));

            if (invert) brightness = 1 - brightness;

            const characterIndex = Math.min(
              characters.length - 1,
              Math.floor(brightness * (characters.length - 1)),
            );
            line += characters[characterIndex];
          }

          lines.push(line);
        }

        result = lines.join("\n");
        resultSize = { columns, rows };
        $("ascii").textContent = result;
        $("ascii").classList.add("visible");
        fitAsciiPreview();
        $("empty").hidden = true;
        $("copy").disabled = false;
        $("download").disabled = false;
        $("dot").classList.add("ready");
        $("stats").textContent = `${(columns * rows).toLocaleString("pt-BR")} caracteres`;
        $("dimensions").textContent = `${columns} × ${rows} caracteres`;
        setHint("Conversão concluída. Você pode copiar ou baixar sua arte.");
      }

      function reset() {
        if (source?.url) URL.revokeObjectURL(source.url);

        source = null;
        sourceName = "";
        result = "";
        resultSize = { columns: 0, rows: 0 };
        fileInput.value = "";
        $("fileMeta").classList.remove("show");
        $("ascii").classList.remove("visible");
        $("ascii").textContent = "";
        $("empty").hidden = false;
        $("convert").disabled = true;
        $("copy").disabled = true;
        $("download").disabled = true;
        $("dot").classList.remove("ready");
        setZoom(1);
        $("dimensions").textContent = "aguardando imagem";
        $("stats").textContent = "— caracteres";
        setHint("Escolha uma imagem para começar.");
      }

      function fitAsciiPreview() {
        if (!resultSize.columns || !resultSize.rows) return;

        const preview = $("previewCanvas");
        const availableWidth = Math.max(0, preview.clientWidth - 44);
        const availableHeight = Math.max(0, preview.clientHeight - 44);
        const widthFit = availableWidth / (resultSize.columns * 0.62);
        const heightFit = availableHeight / (resultSize.rows * 1.05);
        const fontSize = Math.max(2, Math.min(10, widthFit, heightFit));

        $("ascii").style.fontSize = `${fontSize}px`;
        applyZoom();
      }

      function setZoom(value) {
        zoom = Math.max(1, Math.min(4, value));
        if (zoom === 1) {
          panX = 0;
          panY = 0;
        }

        $("zoomLevel").textContent = `${Math.round(zoom * 100)}%`;
        applyZoom();
      }

      function applyZoom() {
        const preview = $("previewCanvas");
        $("ascii").style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
        preview.classList.toggle("is-zoomed", zoom > 1);
      }

      function changeZoom(direction) {
        setZoom(zoom + direction * 0.25);
      }

      window.addEventListener("resize", fitAsciiPreview);
      $("zoomIn").addEventListener("click", () => changeZoom(1));
      $("zoomOut").addEventListener("click", () => changeZoom(-1));
      $("zoomReset").addEventListener("click", () => setZoom(1));

      $("previewCanvas").addEventListener("wheel", (event) => {
        if (!resultSize.columns) return;
        event.preventDefault();
        changeZoom(event.deltaY < 0 ? 1 : -1);
      }, { passive: false });

      $("previewCanvas").addEventListener("pointerdown", (event) => {
        if (zoom === 1 || event.button !== 0) return;

        dragStart = { x: event.clientX - panX, y: event.clientY - panY };
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.classList.add("dragging");
      });

      $("previewCanvas").addEventListener("pointermove", (event) => {
        if (!dragStart) return;

        panX = event.clientX - dragStart.x;
        panY = event.clientY - dragStart.y;
        applyZoom();
      });

      function stopDragging(event) {
        if (!dragStart) return;

        dragStart = null;
        event.currentTarget.classList.remove("dragging");
      }

      $("previewCanvas").addEventListener("pointerup", stopDragging);
      $("previewCanvas").addEventListener("pointercancel", stopDragging);

      $("choose").addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", (event) => {
        if (event.target.files[0]) loadFile(event.target.files[0]);
      });

      ["dragenter", "dragover"].forEach((eventName) => {
        dropZone.addEventListener(eventName, (event) => {
          event.preventDefault();
          dropZone.classList.add("drag");
        });
      });

      ["dragleave", "drop"].forEach((eventName) => {
        dropZone.addEventListener(eventName, (event) => {
          event.preventDefault();
          dropZone.classList.remove("drag");
        });
      });

      dropZone.addEventListener("drop", (event) => {
        const file = event.dataTransfer.files[0];
        if (file) loadFile(file);
      });

      widthInput.addEventListener("input", () => {
        $("widthValue").textContent = `${widthInput.value} colunas`;
        if (source) convertImage();
      });

      contrastInput.addEventListener("input", () => {
        $("contrastValue").textContent = `${contrastInput.value}%`;
        if (source) convertImage();
      });

      paletteSelect.addEventListener("change", () => {
        if (source) convertImage();
      });

      $("invert").addEventListener("change", () => {
        if (source) convertImage();
      });

      $("convert").addEventListener("click", convertImage);
      $("reset").addEventListener("click", reset);

      $("copy").addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(result);
          $("copy").textContent = "Copiado!";
          setTimeout(() => {
            $("copy").textContent = "Copiar";
          }, 1300);
        } catch {
          setHint("Não foi possível copiar. Tente selecionar a arte manualmente.", true);
        }
      });

      $("download").addEventListener("click", () => {
        const imageCanvas = createAsciiImage();
        const link = document.createElement("a");
        const baseName = sourceName.replace(/\.[^.]+$/, "") || "pixeltype";

        link.href = imageCanvas.toDataURL("image/png");
        link.download = `${baseName}-ascii.png`;
        link.click();
      });

      function createAsciiImage() {
        const lines = result.split("\n");
        const scale = 2;
        const fontSize = 18 * scale;
        const lineHeight = 22 * scale;
        const padding = 28 * scale;
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        context.font = `${fontSize}px monospace`;
        const characterWidth = context.measureText("M").width;
        const columns = Math.max(...lines.map((line) => line.length));

        canvas.width = Math.ceil(columns * characterWidth + padding * 2);
        canvas.height = lines.length * lineHeight + padding * 2;

        context.fillStyle = "#16171b";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.font = `${fontSize}px monospace`;
        context.textBaseline = "top";
        context.fillStyle = "#c8f169";

        lines.forEach((line, index) => {
          context.fillText(line, padding, padding + index * lineHeight);
        });

        return canvas;
      }
    })();
