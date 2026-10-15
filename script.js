"use strict";

/*
 * DESAFIO DOS ANIMAIS: LIBRAS
 * HTML5 + CSS3 + JavaScript + TensorFlow.js + Teachable Machine.
 */

// ======================================================
// 1. CONFIGURAÇÕES
// ======================================================

const MODEL_URL =
  "https://teachablemachine.withgoogle.com/models/S2ak9l58J/";

const REQUIRED_CONFIDENCE = 0.85;
const HOLD_DURATION_MS = 1500;
const INFERENCE_INTERVAL_MS = 100;

// Classes esperadas no modelo, na ordem das fases.
const PHASES = [
  {
    animal: "macaco",
    title: "Sinal de Macaco",
    image: "imagens/macaco.png"
  },
  {
    animal: "boi",
    title: "Sinal de Boi",
    image: "imagens/boi.png"
  },
  {
    animal: "cachorro",
    title: "Sinal de Cachorro",
    image: "imagens/cachorro.png"
  },
  {
    animal: "gorila",
    title: "Sinal de Gorila",
    image: "imagens/gorila.png"
  },
  {
    animal: "barata",
    title: "Sinal de Barata",
    image: "imagens/barata.png"
  }
];

// ======================================================
// 2. ELEMENTOS DA INTERFACE
// ======================================================

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

// ======================================================
// 3. ESTADO DO JOGO
// ======================================================

let model = null;
let webcam = null;

let currentPhase = 0;
let accumulatedTime = 0;

let lastFrameTime = 0;
let lastInferenceTime = 0;

let animationFrameId = null;

let isRunning = false;
let isLoading = false;
let isFinished = false;

// Cada nova partida recebe uma geração diferente.
// Isso impede que uma inferência antiga altere o novo jogo.
let gameGeneration = 0;

// ======================================================
// 4. FUNÇÕES AUXILIARES
// ======================================================

function normalizeLabel(label) {
  return String(label ?? "")
    .toLowerCase()
    .trim();
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

  ui.progressTrack.setAttribute(
    "aria-valuenow",
    String(percent)
  );
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

  ui.predictionLabel.textContent =
    label || "Não identificado";

  ui.confidenceText.textContent =
    `Confiança: ${percent}%`;

  ui.confidenceFill.style.width = `${percent}%`;

  ui.confidenceTrack.setAttribute(
    "aria-valuenow",
    String(percent)
  );
}

// ======================================================
// 5. ATUALIZAÇÃO DAS FASES
// ======================================================

function renderPhase() {
  const phase = PHASES[currentPhase];

  ui.phaseLabel.textContent =
    `FASE ${currentPhase + 1} DE ${PHASES.length}`;

  ui.animalTitle.textContent = phase.title;

  ui.animalDescription.textContent =
    `Observe o tutorial e reproduza o sinal de ${phase.animal}.`;

  ui.tutorialImage.hidden = false;
  ui.imageFallback.hidden = true;

  ui.tutorialImage.alt =
    `Tutorial do sinal de ${phase.animal} em Libras`;

  ui.tutorialImage.src = phase.image;

  ui.progressMessage.textContent =
    "Mantenha o sinal correto para avançar!";

  resetProgress();
}

// Trata imagens ausentes sem utilizar HTML dinâmico.
ui.tutorialImage.addEventListener("error", () => {
  ui.tutorialImage.hidden = true;
  ui.imageFallback.hidden = false;

  ui.imagePath.textContent =
    PHASES[currentPhase].image;
});

ui.tutorialImage.addEventListener("load", () => {
  ui.tutorialImage.hidden = false;
  ui.imageFallback.hidden = true;
});

// ======================================================
// 6. CARREGAMENTO DO MODELO
// ======================================================

async function loadModel() {
  if (typeof tf === "undefined") {
    throw new Error(
      "TensorFlow.js não carregou. Verifique sua conexão."
    );
  }

  if (typeof tmImage === "undefined") {
    throw new Error(
      "A biblioteca Teachable Machine não carregou."
    );
  }

  const baseURL = MODEL_URL.endsWith("/")
    ? MODEL_URL
    : `${MODEL_URL}/`;

  updateStatus("Carregando inteligência artificial...");

  model = await tmImage.load(
    `${baseURL}model.json`,
    `${baseURL}metadata.json`
  );

  // Verifica as classes reais do modelo publicado.
  const availableClasses = model
    .getClassLabels()
    .map(normalizeLabel);

  const requiredClasses = [
    "macaco",
    "boi",
    "cachorro",
    "gorila",
    "barata",
    "ninguem",
    "parado"
  ];

  const missingClasses = requiredClasses.filter(
    label => !availableClasses.includes(label)
  );

  if (missingClasses.length > 0) {
    model = null;

    throw new Error(
      `O modelo não contém estas classes: ${
        missingClasses.join(", ")
      }. Confira as labels no Teachable Machine.`
    );
  }
}

// ======================================================
// 7. INICIALIZAÇÃO DA WEBCAM
// ======================================================

async function startWebcam() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      "A webcam exige HTTPS ou localhost em um navegador compatível."
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
        "Acesso à câmera negado. Permita o uso da webcam no navegador."
      );
    }

    if (error.name === "NotFoundError") {
      throw new Error(
        "Nenhuma câmera foi encontrada neste dispositivo."
      );
    }

    throw new Error(
      `Não foi possível iniciar a câmera: ${error.message}`
    );
  }
}

function stopWebcam() {
  if (webcam) {
    try {
      webcam.stop();
    } catch (error) {
      console.warn("Erro ao encerrar a webcam:", error);
    }

    if (webcam.canvas) {
      webcam.canvas.remove();
    }

    webcam = null;
  }

  ui.cameraPlaceholder.hidden = false;
}

// ======================================================
// 8. INÍCIO DO JOGO
// ======================================================

async function startGame() {
  if (isLoading || isRunning) {
    return;
  }

  isLoading = true;
  ui.startButton.disabled = true;
  ui.startButton.textContent = "Preparando...";

  const generation = ++gameGeneration;

  try {
    if (!model) {
      await loadModel();
    }

    // O usuário pode ter iniciado outra operação durante o carregamento.
    if (generation !== gameGeneration) {
      return;
    }

    await startWebcam();

    if (generation !== gameGeneration) {
      stopWebcam();
      return;
    }

    currentPhase = 0;
    lastFrameTime = 0;
    lastInferenceTime = 0;
    isFinished = false;
    isRunning = true;

    ui.gameScreen.hidden = false;
    ui.endScreen.hidden = true;

    renderPhase();

    ui.startButton.textContent = "Jogo em andamento";

    updateStatus(
      "Câmera pronta! Faça o sinal de macaco."
    );

    // Inicia um único loop de reconhecimento.
    animationFrameId = requestAnimationFrame(
      timestamp => gameLoop(timestamp, generation)
    );
  } catch (error) {
    console.error("Erro ao iniciar o jogo:", error);

    isRunning = false;
    stopWebcam();

    updateStatus(
      `Não foi possível iniciar: ${error.message}`
    );

    ui.startButton.disabled = false;
    ui.startButton.textContent = "Tentar novamente";
  } finally {
    isLoading = false;
  }
}

// ======================================================
// 9. LOOP DA INTELIGÊNCIA ARTIFICIAL
// ======================================================

async function gameLoop(timestamp, generation) {
  if (
    !isRunning ||
    isFinished ||
    generation !== gameGeneration
  ) {
    return;
  }

  try {
    // Atualiza a imagem da câmera em cada iteração.
    webcam.update();

    if (lastFrameTime === 0) {
      lastFrameTime = timestamp;
      lastInferenceTime = timestamp;

      scheduleNextFrame(generation);
      return;
    }

    // Evita inferências desnecessariamente frequentes.
    if (
      timestamp - lastInferenceTime <
      INFERENCE_INTERVAL_MS
    ) {
      scheduleNextFrame(generation);
      return;
    }

    // Limita grandes saltos de tempo após travamentos da aba.
    const delta = Math.min(
      timestamp - lastInferenceTime,
      200
    );

    lastInferenceTime = timestamp;
    lastFrameTime = timestamp;

    // A execução é sequencial: não iniciamos outro predict()
    // enquanto esta inferência ainda está sendo processada.
    const predictions = await model.predict(webcam.canvas);

    if (
      !isRunning ||
      isFinished ||
      generation !== gameGeneration
    ) {
      return;
    }

    processPredictions(predictions, delta);

    // Se a última fase foi concluída, finishGame encerra o loop.
    if (isRunning && generation === gameGeneration) {
      scheduleNextFrame(generation);
    }
  } catch (error) {
    if (generation !== gameGeneration) {
      return;
    }

    console.error("Erro durante a inferência:", error);

    isRunning = false;
    gameGeneration++;

    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    stopWebcam();

    updateStatus(
      "O reconhecimento falhou. Clique para tentar novamente."
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

// ======================================================
// 10. VALIDAÇÃO DO SINAL
// ======================================================

function processPredictions(predictions, delta) {
  if (!Array.isArray(predictions) || predictions.length === 0) {
    decayProgress(delta);
    return;
  }

  // Escolhe a classe com maior probabilidade.
  const bestPrediction = predictions.reduce(
    (best, prediction) =>
      prediction.probability > best.probability
        ? prediction
        : best
  );

  const predictedLabel = normalizeLabel(
    bestPrediction.className
  );

  const probability = Number(
    bestPrediction.probability
  ) || 0;

  updateConfidence(predictedLabel, probability);

  const expectedAnimal = normalizeLabel(
    PHASES[currentPhase].animal
  );

  // As classes neutras nunca podem concluir uma fase.
  const isNeutral =
    predictedLabel === "parado" ||
    predictedLabel === "ninguem";

  const isCorrect =
    !isNeutral &&
    predictedLabel === expectedAnimal &&
    probability > REQUIRED_CONFIDENCE;

  if (isCorrect) {
    // Soma o tempo apenas enquanto o sinal é reconhecido.
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

  // O sinal mudou, a confiança caiu ou não há sinal.
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

    updateStatus("Quase lá! Continue ajustando o sinal.");
  }
}

// ======================================================
// 11. DECAIMENTO GRADUAL DA BARRA
// ======================================================

function decayProgress(delta) {
  // Em condições normais, a barra recua cerca de 100 ms
  // para cada 100 ms sem um sinal válido.
  // O Math.max impede que o progresso fique negativo.
  accumulatedTime = Math.max(
    0,
    accumulatedTime - delta
  );

  updateProgress();
}

// ======================================================
// 12. AVANÇO DE FASE
// ======================================================

function advancePhase() {
  if (!isRunning || isFinished) {
    return;
  }

  currentPhase++;

  if (currentPhase >= PHASES.length) {
    finishGame();
    return;
  }

  renderPhase();

  updateStatus(
    `Fase concluída! Agora faça o sinal de ${
      PHASES[currentPhase].animal
    }.`
  );
}

// ======================================================
// 13. TELA DE VITÓRIA
// ======================================================

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

// ======================================================
// 14. REINICIALIZAÇÃO
// ======================================================

async function restartGame() {
  if (isLoading) {
    return;
  }

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
  lastFrameTime = 0;
  lastInferenceTime = 0;

  ui.endScreen.hidden = true;
  ui.gameScreen.hidden = false;

  ui.predictionLabel.textContent =
    "Aguardando inicialização...";

  ui.confidenceText.textContent = "Confiança: 0%";
  ui.confidenceFill.style.width = "0%";

  ui.confidenceTrack.setAttribute("aria-valuenow", "0");

  ui.startButton.disabled = false;
  ui.startButton.textContent = "Iniciar jogo";

  renderPhase();

  updateStatus("Vamos começar uma nova partida!");

  // Reutiliza o modelo já carregado, se disponível.
  await startGame();
}

// ======================================================
// 15. EVENTOS E INICIALIZAÇÃO
// ======================================================

ui.startButton.addEventListener("click", startGame);

ui.restartButton.addEventListener("click", restartGame);

// Exibe a primeira fase antes de iniciar a câmera.
renderPhase();
updateProgress();