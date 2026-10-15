
"use strict";

// ============================================
// 1. CONFIGURAÇÕES DO JOGO
// ============================================

const MODEL_URL =
  "https://teachablemachine.withgoogle.com/models/S2ak9l58J/";

const REQUIRED_CONFIDENCE = 0.85;
const HOLD_DURATION_MS = 1500;
const INFERENCE_INTERVAL_MS = 100;

const PHASES = [
  { animal: "macaco", title: "Sinal de Macaco", image: "imagens/macaco.png" },
  { animal: "boi", title: "Sinal de Boi", image: "imagens/boi.png" },
  { animal: "cachorro", title: "Sinal de Cachorro", image: "imagens/cachorro.png" },
  { animal: "gorila", title: "Sinal de Gorila", image: "imagens/gorila.png" },
  { animal: "barata", title: "Sinal de Barata", image: "imagens/barata.png" }
];

// ============================================
// 2. ELEMENTOS HTML
// ============================================

const $ = id => document.getElementById(id);

const ui = {
  gameScreen: $("game-screen"),
  endScreen: $("end-screen"),
  phaseLabel: $("phase-label"),
  animalTitle: $("animal-title"),
  animalDescription: $("animal-description"),
  tutorialImage: $("tutorial-image"),
  imageFallback: $("image-fallback"),
  imagePath: $("image-path"),
  webcamContainer: $("webcam-container"),
  cameraPlaceholder: $("camera-placeholder"),
  predictionLabel: $("prediction-label"),
  confidenceTrack: $("confidence-track"),
  confidenceFill: $("confidence-fill"),
  confidenceText: $("confidence-text"),
  progressTrack: $("progress-track"),
  progressFill: $("progress-fill"),
  progressPercent: $("progress-percent"),
  progressMessage: $("progress-message"),
  statusMessage: $("status-message"),
  startButton: $("start-button"),
  restartButton: $("restart-button")
};

// ============================================
// 3. ESTADO
// ============================================

let model = null;
let webcam = null;
let currentPhase = 0;
let accumulatedTime = 0;
let lastInferenceTime = 0;
let animationFrameId = null;
let isRunning = false;
let isLoading = false;
let isFinished = false;
let gameGeneration = 0;

// ============================================
// 4. FUNÇÕES AUXILIARES
// ============================================

function normalizeLabel(label) {
  return String(label ?? "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function updateStatus(message) {
  ui.statusMessage.textContent = message;
}

function updateProgress() {
  const percent = Math.min(
    100,
    Math.round((accumulatedTime / HOLD_DURATION_MS) * 100)
  );

  ui.progressFill.style.width = `${percent}%`;
  ui.progressPercent.textContent = `${percent}%`;
  ui.progressTrack.setAttribute("aria-valuenow", String(percent));
}

function resetProgress() {
  accumulatedTime = 0;
  updateProgress();
}

function updateConfidence(label, probability) {
  const safeProbability = Math.max(
    0,
    Math.min(1, Number(probability) || 0)
  );

  const percent = Math.round(safeProbability * 100);

  ui.predictionLabel.textContent = label || "Não identificado";
  ui.confidenceText.textContent = `Confiança: ${percent}%`;
  ui.confidenceFill.style.width = `${percent}%`;

  ui.confidenceTrack.setAttribute("aria-valuenow", String(percent));
}

// ============================================
// 5. FASES E IMAGENS
// ============================================

function renderPhase() {
  const phase = PHASES[currentPhase];

  ui.phaseLabel.textContent =
    `FASE ${currentPhase + 1} DE ${PHASES.length}`;

  ui.animalTitle.textContent = phase.title;
  ui.animalDescription.textContent =
    `Observe o tutorial e reproduza o sinal de ${phase.animal}.`;

  ui.tutorialImage.hidden = false;
  ui.imageFallback.hidden = true;
  ui.tutorialImage.alt = `Tutorial do sinal de ${phase.animal} em Libras`;
  ui.tutorialImage.src = phase.image;

  ui.progressMessage.textContent =
    "Mantenha o sinal correto para avançar!";

  resetProgress();
}

ui.tutorialImage.addEventListener("error", () => {
  ui.tutorialImage.hidden = true;
  ui.imageFallback.hidden = false;
  ui.imagePath.textContent = PHASES[currentPhase].image;
});

ui.tutorialImage.addEventListener("load", () => {
  ui.tutorialImage.hidden = false;
  ui.imageFallback.hidden = true;
});

// ============================================
// 6. CARREGAMENTO DO MODELO
// ============================================

async function loadModel() {
  if (typeof tf === "undefined") {
    throw new Error("TensorFlow.js não foi carregado. Verifique sua internet.");
  }

  if (typeof tmImage === "undefined") {
    throw new Error("A biblioteca Teachable Machine não foi carregada.");
  }

  const baseURL = MODEL_URL.endsWith("/")
    ? MODEL_URL
    : `${MODEL_URL}/`;

  updateStatus("Carregando o modelo de inteligência artificial...");

  model = await tmImage.load(
    `${baseURL}model.json`,
    `${baseURL}metadata.json`
  );

  const availableClasses = model
    .getClassLabels()
    .map(normalizeLabel);

  // Só exigimos as cinco classes necessárias para as fases.
  // "ninguem" e "parado" são opcionais.
  const requiredClasses = [
    "macaco",
    "boi",
    "cachorro",
    "gorila",
    "barata"
  ];

  const missingClasses = requiredClasses.filter(
    label => !availableClasses.includes(label)
  );

  if (missingClasses.length > 0) {
    model = null;

    throw new Error(
      `O modelo não contém estas classes: ${missingClasses.join(", ")}. ` +
      `Classes encontradas: ${availableClasses.join(", ")}.`
    );
  }

  console.log("Modelo carregado!");
  console.log("Classes detectadas:", availableClasses);
}

// ============================================
// 7. WEBCAM
// ============================================

async function startWebcam() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      "A câmera exige HTTPS ou localhost. Abra o projeto pelo Live Server."
    );
  }

  webcam = new tmImage.Webcam(400, 300, true);

  try {
    await webcam.setup();
    await webcam.play();

    ui.cameraPlaceholder.hidden = true;
    ui.webcamContainer.appendChild(webcam.canvas);
  } catch (error) {
    stopWebcam();

    if (error.name === "NotAllowedError") {
      throw new Error(
        "Permissão da câmera negada. Permita o acesso nas configurações do navegador."
      );
    }

    if (error.name === "NotFoundError") {
      throw new Error("Nenhuma câmera foi encontrada.");
    }

    throw new Error(`Falha na câmera: ${error.message}`);
  }
}

function stopWebcam() {
  if (webcam) {
    try {
      webcam.stop();
    } catch (error) {
      console.warn("Erro ao encerrar câmera:", error);
    }

    if (webcam.canvas) {
      webcam.canvas.remove();
    }

    webcam = null;
  }

  ui.cameraPlaceholder.hidden = false;
}

// ============================================
// 8. INICIAR JOGO
// ============================================

async function startGame() {
  if (isLoading || isRunning) return;

  isLoading = true;
  ui.startButton.disabled = true;
  ui.startButton.textContent = "Preparando...";

  const generation = ++gameGeneration;

  try {
    if (!model) {
      await loadModel();
    }

    if (generation !== gameGeneration) return;

    await startWebcam();

    if (generation !== gameGeneration) {
      stopWebcam();
      return;
    }

    currentPhase = 0;
    lastInferenceTime = 0;
    isFinished = false;
    isRunning = true;

    ui.gameScreen.hidden = false;
    ui.endScreen.hidden = true;

    renderPhase();

    ui.startButton.textContent = "Jogo em andamento";

    updateStatus("Câmera pronta! Faça o sinal de macaco.");

    animationFrameId = requestAnimationFrame(
      timestamp => gameLoop(timestamp, generation)
    );
  } catch (error) {
    console.error("Erro ao iniciar:", error);

    isRunning = false;
    stopWebcam();

    updateStatus(`Não foi possível iniciar: ${error.message}`);

    ui.startButton.disabled = false;
    ui.startButton.textContent = "Tentar novamente";
  } finally {
    isLoading = false;
  }
}

// ============================================
// 9. LOOP DE RECONHECIMENTO
// ============================================

async function gameLoop(timestamp, generation) {
  if (
    !isRunning ||
    isFinished ||
    generation !== gameGeneration
  ) {
    return;
  }

  try {
    webcam.update();

    if (lastInferenceTime === 0) {
      lastInferenceTime = timestamp;

      scheduleNextFrame(generation);
      return;
    }

    if (timestamp - lastInferenceTime < INFERENCE_INTERVAL_MS) {
      scheduleNextFrame(generation);
      return;
    }

    const delta = Math.min(
      timestamp - lastInferenceTime,
      200
    );

    lastInferenceTime = timestamp;

    const predictions = await model.predict(webcam.canvas);

    if (
      !isRunning ||
      isFinished ||
      generation !== gameGeneration
    ) {
      return;
    }

    processPredictions(predictions, delta);

    if (isRunning && generation === gameGeneration) {
      scheduleNextFrame(generation);
    }
  } catch (error) {
    if (generation !== gameGeneration) return;

    console.error("Erro na inferência:", error);

    isRunning = false;
    gameGeneration++;

    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    stopWebcam();

    updateStatus(
      "O reconhecimento falhou. Tente iniciar novamente."
    );

    ui.startButton.disabled = false;
    ui.startButton.textContent = "Tentar novamente";
  }
}

function scheduleNextFrame(generation) {
  if (
    !isRunning ||
    isFinished ||
    generation !== gameGeneration
  ) {
    return;
  }

  animationFrameId = requestAnimationFrame(
    timestamp => gameLoop(timestamp, generation)
  );
}

// ============================================
// 10. VALIDAÇÃO DAS PREVISÕES
// ============================================

function processPredictions(predictions, delta) {
  if (!Array.isArray(predictions) || predictions.length === 0) {
    decayProgress(delta);
    return;
  }

  const bestPrediction = predictions.reduce(
    (best, item) =>
      item.probability > best.probability ? item : best
  );

  const predictedLabel = normalizeLabel(bestPrediction.className);
  const probability = Number(bestPrediction.probability) || 0;

  updateConfidence(predictedLabel, probability);

  const expectedAnimal = normalizeLabel(
    PHASES[currentPhase].animal
  );

  // A normalização também converte "ninguém" em "ninguem".
  const neutralClasses = ["ninguem", "parado"];

  const isNeutral = neutralClasses.includes(predictedLabel);

  const isCorrect =
    !isNeutral &&
    predictedLabel === expectedAnimal &&
    probability > REQUIRED_CONFIDENCE;

  if (isCorrect) {
    accumulatedTime = Math.min(
      HOLD_DURATION_MS,
      accumulatedTime + delta
    );

    updateProgress();

    ui.progressMessage.textContent =
      "Muito bem! Continue mantendo o sinal.";

    updateStatus(
      `Sinal reconhecido com ${Math.round(probability * 100)}% de confiança.`
    );

    if (accumulatedTime >= HOLD_DURATION_MS) {
      advancePhase();
    }

    return;
  }

  decayProgress(delta);

  if (isNeutral) {
    ui.progressMessage.textContent =
      "Faça o sinal do animal para preencher a barra.";

    updateStatus("Aguardando um sinal...");
  } else if (predictedLabel !== expectedAnimal) {
    ui.progressMessage.textContent =
      "Observe o tutorial e tente novamente.";

    updateStatus("A IA está detectando outro sinal.");
  } else {
    ui.progressMessage.textContent =
      "Mantenha a confiança acima de 85%.";

    updateStatus("Continue ajustando o sinal.");
  }
}

// ============================================
// 11. DECAIMENTO DO PROGRESSO
// ============================================

function decayProgress(delta) {
  accumulatedTime = Math.max(
    0,
    accumulatedTime - delta
  );

  updateProgress();
}

// ============================================
// 12. AVANÇAR DE FASE
// ============================================

function advancePhase() {
  if (!isRunning || isFinished) return;

  currentPhase++;

  if (currentPhase >= PHASES.length) {
    finishGame();
    return;
  }

  renderPhase();

  updateStatus(
    `Muito bem! Agora faça o sinal de ${PHASES[currentPhase].animal}.`
  );
}

// ============================================
// 13. FIM DE JOGO
// ============================================

function finishGame() {
  isFinished = true;
  isRunning = false;
  gameGeneration++;

  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  stopWebcam();

  ui.gameScreen.hidden = true;
  ui.endScreen.hidden = false;

  ui.startButton.disabled = false;
  ui.startButton.textContent = "Iniciar jogo";
}

// ============================================
// 14. REINICIAR
// ============================================

async function restartGame() {
  if (isLoading) return;

  isRunning = false;
  isFinished = false;
  gameGeneration++;

  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  stopWebcam();

  currentPhase = 0;
  accumulatedTime = 0;
  lastInferenceTime = 0;

  ui.endScreen.hidden = true;
  ui.gameScreen.hidden = false;

  ui.predictionLabel.textContent = "Aguardando inicialização...";
  ui.confidenceText.textContent = "Confiança: 0%";
  ui.confidenceFill.style.width = "0%";

  ui.confidenceTrack.setAttribute("aria-valuenow", "0");

  ui.startButton.disabled = false;
  ui.startButton.textContent = "Iniciar jogo";

  renderPhase();

  updateStatus("Vamos começar uma nova partida!");

  await startGame();
}

// ============================================
// 15. EVENTOS E ESTADO INICIAL
// ============================================

ui.startButton.addEventListener("click", startGame);
ui.restartButton.addEventListener("click", restartGame);

renderPhase();
updateProgress();
