/**
 * easyA5print - Client-side In-Browser PDF Imposition
 * Zero dependencies, runs 100% locally on any device.
 */

// Application State
const state = {
  file: null,
  fileName: '',
  pdfBytes: null,
  srcDoc: null,
  totalPages: 0,
  startPage: 1,
  endPage: 1,
  generatedPdfBytes: null,
  generatedFileName: '',
};

// DOM Elements
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const dropContent = document.getElementById('dropContent');
const browseBtn = document.getElementById('browseBtn');
const fileLoadedBar = document.getElementById('fileLoadedBar');
const fileNameEl = document.getElementById('fileName');
const fileMetaEl = document.getElementById('fileMeta');
const changeFileBtn = document.getElementById('changeFileBtn');

const configCard = document.getElementById('configCard');
const startPageInput = document.getElementById('startPageInput');
const endPageInput = document.getElementById('endPageInput');
const startMinusBtn = document.getElementById('startMinusBtn');
const startPlusBtn = document.getElementById('startPlusBtn');
const endMinusBtn = document.getElementById('endMinusBtn');
const endPlusBtn = document.getElementById('endPlusBtn');

const allPagesChip = document.getElementById('allPagesChip');

const metricSelected = document.getElementById('metricSelected');
const metricSheets = document.getElementById('metricSheets');
const metricPadding = document.getElementById('metricPadding');

const processBtn = document.getElementById('processBtn');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');

const previewCard = document.getElementById('previewCard');
const sheetCountBadge = document.getElementById('sheetCountBadge');
const sheetsGrid = document.getElementById('sheetsGrid');

const successCard = document.getElementById('successCard');
const successSubtitle = document.getElementById('successSubtitle');
const downloadAgainBtn = document.getElementById('downloadAgainBtn');

// Initialize Event Listeners
function init() {
  // Drag and drop handlers
  ['dragenter', 'dragover'].forEach(evtName => {
    dropZone.addEventListener(evtName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('drag-over');
    });
  });

  ['dragleave', 'drop'].forEach(evtName => {
    dropZone.addEventListener(evtName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('drag-over');
    });
  });

  dropZone.addEventListener('drop', (e) => {
    if (e.dataTransfer && e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  });

  browseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileSelected(e.target.files[0]);
    }
  });

  changeFileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    resetFileInput();
    fileInput.click();
  });

  // Stepper handlers
  startMinusBtn.addEventListener('click', () => adjustPage('start', -1));
  startPlusBtn.addEventListener('click', () => adjustPage('start', 1));
  endMinusBtn.addEventListener('click', () => adjustPage('end', -1));
  endPlusBtn.addEventListener('click', () => adjustPage('end', 1));

  startPageInput.addEventListener('input', sanitizeInputsAndUpdate);
  endPageInput.addEventListener('input', sanitizeInputsAndUpdate);

  // Quick Preset Chip (All Pages)
  if (allPagesChip) {
    allPagesChip.addEventListener('click', () => {
      state.startPage = 1;
      state.endPage = state.totalPages;
      syncInputsAndUpdate();
    });
  }

  // Action Buttons
  processBtn.addEventListener('click', generateImpositionPdf);
  downloadAgainBtn.addEventListener('click', downloadCurrentResult);
}

function resetFileInput() {
  fileInput.value = '';
}

// File Loading Handler
async function handleFileSelected(file) {
  if (!file || file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    alert('Please select a valid PDF file.');
    return;
  }

  state.file = file;
  state.fileName = file.name;

  try {
    dropContent.style.display = 'none';
    fileLoadedBar.style.display = 'flex';
    fileNameEl.textContent = file.name;
    fileMetaEl.textContent = 'Reading PDF...';

    const arrayBuffer = await file.arrayBuffer();
    state.pdfBytes = arrayBuffer;

    if (typeof PDFLib === 'undefined') {
      throw new Error('PDF-lib library failed to load. Please check your internet connection or ensure easyA5print_pdf-lib.min.js is present.');
    }

    state.srcDoc = await PDFLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    state.totalPages = state.srcDoc.getPageCount();

    if (state.totalPages === 0) {
      throw new Error('This PDF has no pages.');
    }

    const sizeFormatted = (file.size / (1024 * 1024)).toFixed(1) + ' MB';
    fileMetaEl.textContent = `${state.totalPages} pages • ${sizeFormatted}`;

    // Update range inputs
    state.startPage = 1;
    state.endPage = state.totalPages;

    startPageInput.min = 1;
    startPageInput.max = state.totalPages;
    endPageInput.min = 1;
    endPageInput.max = state.totalPages;

    syncInputsAndUpdate();

    configCard.style.display = 'block';
    previewCard.style.display = 'block';
    successCard.style.display = 'none';

  } catch (err) {
    console.error(err);
    alert(`Could not load PDF: ${err.message || err}`);
    dropContent.style.display = 'block';
    fileLoadedBar.style.display = 'none';
  }
}

function adjustPage(target, delta) {
  if (target === 'start') {
    state.startPage = Math.max(1, Math.min(state.startPage + delta, state.endPage));
  } else {
    state.endPage = Math.max(state.startPage, Math.min(state.endPage + delta, state.totalPages));
  }
  syncInputsAndUpdate();
}

function sanitizeInputsAndUpdate() {
  let s = parseInt(startPageInput.value, 10);
  let e = parseInt(endPageInput.value, 10);

  if (isNaN(s)) s = 1;
  if (isNaN(e)) e = state.totalPages;

  s = Math.max(1, Math.min(s, state.totalPages));
  e = Math.max(1, Math.min(e, state.totalPages));

  if (s > e) {
    e = s;
  }

  state.startPage = s;
  state.endPage = e;

  updateMathAndPreview();
}

function syncInputsAndUpdate() {
  startPageInput.value = state.startPage;
  endPageInput.value = state.endPage;
  updateMathAndPreview();
}

// Compute Cut & Stack Logic
function computePairs(totalSelected, start) {
  const numSheets = Math.ceil(totalSelected / 2);
  const pages = [];
  for (let i = 0; i < totalSelected; i++) {
    pages.push(start + i);
  }

  const pile1 = pages.slice(0, numSheets);
  const pile2 = pages.slice(numSheets);

  let padded = false;
  if (pile2.length < numSheets) {
    pile2.push(null);
    padded = true;
  }

  const pairs = [];
  for (let i = 0; i < numSheets; i++) {
    pairs.push({
      sheetIndex: i + 1,
      left: pile1[i],
      right: pile2[i],
    });
  }

  return { pairs, numSheets, padded };
}

// Update Math Metrics and Visual Sheet Mockups
function updateMathAndPreview() {
  const totalSelected = state.endPage - state.startPage + 1;
  const { pairs, numSheets, padded } = computePairs(totalSelected, state.startPage);

  // Update metrics
  metricSelected.textContent = totalSelected;
  metricSheets.textContent = numSheets;
  metricPadding.textContent = padded ? '1 Blank' : 'None';
  sheetCountBadge.textContent = `${numSheets} A4 Sheet${numSheets > 1 ? 's' : ''}`;

  // Render sheet preview cards
  sheetsGrid.innerHTML = '';
  pairs.forEach(pair => {
    const card = document.createElement('div');
    card.className = 'sheet-card';

    const header = document.createElement('div');
    header.className = 'sheet-header-text';
    header.innerHTML = `<span>Sheet ${pair.sheetIndex}</span><span>2-Up Landscape</span>`;

    const a4 = document.createElement('div');
    a4.className = 'sheet-a4-landscape';

    // Left Slot
    const leftSlot = document.createElement('div');
    leftSlot.className = `sheet-page-slot ${pair.left === null ? 'blank' : ''}`;
    leftSlot.innerHTML = `
      <span class="slot-page-num">${pair.left !== null ? pair.left : '—'}</span>
      <span class="slot-tag">Left Pile</span>
    `;

    // Right Slot
    const rightSlot = document.createElement('div');
    rightSlot.className = `sheet-page-slot ${pair.right === null ? 'blank' : ''}`;
    rightSlot.innerHTML = `
      <span class="slot-page-num">${pair.right !== null ? pair.right : 'BLANK'}</span>
      <span class="slot-tag">Right Pile</span>
    `;

    a4.appendChild(leftSlot);
    a4.appendChild(rightSlot);
    card.appendChild(header);
    card.appendChild(a4);
    sheetsGrid.appendChild(card);
  });
}

// PDF Imposition Generator
async function generateImpositionPdf() {
  if (!state.srcDoc) return;

  const totalSelected = state.endPage - state.startPage + 1;
  const { pairs, numSheets } = computePairs(totalSelected, state.startPage);

  processBtn.disabled = true;
  progressContainer.style.display = 'block';
  progressBar.style.width = '5%';
  progressText.textContent = 'Initializing document...';

  try {
    const outPdf = await PDFLib.PDFDocument.create();

    // Determine target dimensions from first selected page
    const refPage = state.srcDoc.getPage(state.startPage - 1);
    const { width: srcW, height: srcH } = refPage.getSize();

    // Standard portrait notes: landscape sheet width = srcH, height = srcW
    const sheetW = srcH;
    const sheetH = srcW;
    const slotW = sheetW / 2.0;
    const slotH = sheetH;

    for (let idx = 0; idx < pairs.length; idx++) {
      const pair = pairs[idx];
      const percent = Math.round(((idx + 1) / pairs.length) * 90);
      progressBar.style.width = `${percent}%`;
      progressText.textContent = `Processing sheet ${idx + 1} of ${numSheets}...`;

      // Give browser time to update UI
      await new Promise(resolve => setTimeout(resolve, 5));

      const sheet = outPdf.addPage([sheetW, sheetH]);

      // Place Left Page
      if (pair.left !== null) {
        const [embeddedLeft] = await outPdf.embedPages([state.srcDoc.getPage(pair.left - 1)]);
        const scale = Math.min(slotW / embeddedLeft.width, slotH / embeddedLeft.height);
        const w = embeddedLeft.width * scale;
        const h = embeddedLeft.height * scale;
        const x = (slotW - w) / 2.0;
        const y = (slotH - h) / 2.0;

        sheet.drawPage(embeddedLeft, { x, y, width: w, height: h });
      }

      // Place Right Page
      if (pair.right !== null) {
        const [embeddedRight] = await outPdf.embedPages([state.srcDoc.getPage(pair.right - 1)]);
        const scale = Math.min(slotW / embeddedRight.width, slotH / embeddedRight.height);
        const w = embeddedRight.width * scale;
        const h = embeddedRight.height * scale;
        const x = slotW + (slotW - w) / 2.0;
        const y = (slotH - h) / 2.0;

        sheet.drawPage(embeddedRight, { x, y, width: w, height: h });
      }

      // Draw dashed vertical cutting line down the center
      sheet.drawLine({
        start: { x: slotW, y: 0 },
        end: { x: slotW, y: sheetH },
        thickness: 0.5,
        color: PDFLib.rgb(0.65, 0.65, 0.65),
        dashArray: [4, 4],
      });
    }

    progressBar.style.width = '95%';
    progressText.textContent = 'Finalizing and compiling PDF...';

    const pdfBytes = await outPdf.save();
    state.generatedPdfBytes = pdfBytes;

    const baseName = state.fileName.replace(/\.pdf$/i, '');
    state.generatedFileName = `${baseName}_reordered.pdf`;

    progressBar.style.width = '100%';
    progressText.textContent = 'Complete! Downloading...';

    // Auto-trigger download
    downloadCurrentResult();

    // Show success banner with only the document name
    successSubtitle.textContent = state.generatedFileName;
    successCard.style.display = 'flex';

  } catch (err) {
    console.error(err);
    alert(`Error during processing: ${err.message || err}`);
  } finally {
    processBtn.disabled = false;
    setTimeout(() => {
      progressContainer.style.display = 'none';
    }, 1500);
  }
}

function downloadCurrentResult() {
  if (!state.generatedPdfBytes) return;

  const blob = new Blob([state.generatedPdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = state.generatedFileName || 'document_reordered.pdf';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Run on load
document.addEventListener('DOMContentLoaded', init);
