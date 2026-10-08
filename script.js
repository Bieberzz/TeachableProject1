/ 1. INSIRA A URL DO SEU MODELO EXPORTADO DO TEACHABLE MACHINE AQUI:
const URL_MODELO = "https://withgoogle.com";

// 2. FILA DE FASES DO ANIMALS.LI
// Certifique-se de que 'labelTM' seja idêntico ao nome criado nas classes do Teachable Machine
const fases = [
    { animal: "Macaco", labelTM: "Macaco", imagem: "imagens/tutorial_macaco.jpg" },
    { animal: "Boi", labelTM: "Boi", imagem: "imagens/tutorial_boi.jpg" },
    { animal: "Barata", labelTM: "Barata", imagem: "imagens/tutorial_barata.jpg" },
    { animal: "Cachorro", labelTM: "Cachorro", imagem: "imagens/tutorial_cachorro.jpg" },
    { animal: "Gorila", labelTM: "Gorila", imagem: "imagens/tutorial_gorila.jpg" }
];

let indiceFase = 0;
let model, webcam, maxPredictions;
let jogando = false;
let audioCtx = null;

// Sincroniza o contador visual de fases
document.getElementById('total-fases').innerText = fases.length;

// Sintetizador de efeitos sonoros adaptado para navegadores modernos
function tocarSom(tipo) {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
       
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        if (tipo === 'acerto') {
            osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // Nota D5
            osc.frequency.setValueAtTime(880.00, audioCtx.currentTime + 0.08); // Nota A5
            gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.35);
        } else if (tipo === 'vitoria') {
            const notas = [523.25, 659.25, 783.99, 1046.50]; // Acorde Maior C
            notas.forEach((freq, idx) => {
                const subOsc = audioCtx.createOscillator();
                const subGain = audioCtx.createGain();
                subOsc.connect(subGain);
                subGain.connect(audioCtx.destination);
                subOsc.frequency.setValueAtTime(freq, audioCtx.currentTime + (idx * 0.1));
                subGain.gain.setValueAtTime(0.15, audioCtx.currentTime + (idx * 0.1));
                subGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);
                subOsc.start(audioCtx.currentTime + (idx * 0.1));
                subOsc.stop(audioCtx.currentTime + 0.6);
            });
        }
    } catch (e) {
        console.log("Áudio não suportado ou bloqueado pelo navegador", e);
    }
}

// Inicia a aplicação, webcam e Inteligência Artificial
async function init() {
    document.getElementById("btn-start").style.display = "none";
    const statusDiv = document.getElementById("status");
    statusDiv.style.display = "inline-block";
    statusDiv.innerText = "Carregando Inteligência Artificial...";
    statusDiv.className = "esperando";

    try {
        const modelURL = URL_MODELO + "model.json";
        const metadataURL = URL_MODELO + "metadata.json";

        // Carrega o modelo de classificação de imagens
        model = await tmImage.load(modelURL, metadataURL);
        maxPredictions = model.getTotalClasses();

        // Inicializa parâmetros da Webcam
        const flip = true;
        webcam = new tmImage.Webcam(280, 280, flip);
        await webcam.setup();
        await webcam.play();
       
        // Insere o elemento gerado na árvore HTML
        document.getElementById("webcam-container").appendChild(webcam.canvas);
        document.getElementById("game-grid").style.display = "grid";
       
        jogando = true;
        carregarFase();
        window.requestAnimationFrame(loop);
    } catch (error) {
        statusDiv.innerText = "Erro ao acessar câmera ou modelo. Garanta permissão de webcam.";
        statusDiv.style.background = "#fee2e2";
        statusDiv.style.color = "#ef4444";
    }
}

// Loop recursivo sincronizado com a taxa de atualização do monitor
async function loop() {
    if (jogando) {
        webcam.update();
        await predict();
        window.requestAnimationFrame(loop);
    }
}

// Atualiza o estado da fase atual na tela
function carregarFase() {
    document.getElementById("game-card").classList.remove("success-flash");

    if (indiceFase < fases.length) {
        const faseAtual = fases[indiceFase];
        document.getElementById("fase-atual").innerText = indiceFase + 1;
        document.getElementById("instrucao").innerText = `Faça o sinal para: ${faseAtual.animal}`;
       
        const imgTutorial = document.getElementById("imagem-tutorial");
        imgTutorial.src = faseAtual.imagem;
       
        const statusDiv = document.getElementById("status");
        statusDiv.innerText = "Posicione-se e faça o sinal...";
        statusDiv.className = "esperando";
    } else {
        // Fluxo de Fim de Jogo / Vitória
        jogando = false;
        tocarSom('vitoria');
        document.getElementById("instrucao").innerText = "🎉 Incrível! Você completou a jornada no Animals.Li!";
        document.getElementById("game-grid").style.display = "none";
       
        const statusDiv = document.getElementById("status");
        statusDiv.innerText = "Parabéns! Desafio concluído com sucesso!";
        statusDiv.className = "acertou";
        webcam.stop();
    }
}

// Executa a inferência lógica no frame capturado da webcam
async function predict() {
    const prediction = await model.predict(webcam.canvas);
    const faseAtual = fases[indiceFase];

    // Localiza a classe com maior probabilidade no frame atual
    let maiorPrevisao = { className: "", probability: 0 };
    for (let i = 0; i < maxPredictions; i++) {
        if (prediction[i].probability > maiorPrevisao.probability) {
            maiorPrevisao = prediction[i];
        }
    }

    // Avalia acerto da fase atual (Margem de segurança > 85% de precisão)
    for (let i = 0; i < maxPredictions; i++) {
        if (prediction[i].className === faseAtual.labelTM) {
            const probabilidade = prediction[i].probability;

            if (probabilidade > 0.85) {
                jogando = false;
               
                tocarSom('acerto');
                document.getElementById("game-card").classList.add("success-flash");
               
                const statusDiv = document.getElementById("status");
                statusDiv.innerText = `🎯 Excelente! Você acertou o ${faseAtual.animal}!`;
                statusDiv.className = "acertou";
               
                // Transição suave para fixação da resposta correta
                setTimeout(() => {
                    indiceFase++;
                    jogando = true;
                    carregarFase();
                    window.requestAnimationFrame(loop);
                }, 1800);
                return;
            }
        }
    }

    // Gerencia estados neutros (Parado / Fundo) vs. respostas incorretas detectadas
    const statusDiv = document.getElementById("status");
    if (maiorPrevisao.className === "Fundo" || maiorPrevisao.className === "Parado") {
        statusDiv.innerText = "Aguardando o sinal...";
        statusDiv.className = "esperando";
    } else if (maiorPrevisao.className !== faseAtual.labelTM) {
        statusDiv.innerText = `Detectando algo como: ${maiorPrevisao.className}`;
        statusDiv.className = "detectando";
    }
}

