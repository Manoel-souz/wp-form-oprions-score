class WPFormsQuizScore {
    constructor() {
        console.group('🔍 WPForms Quiz Score - Inicialização');
        console.log('Plugin iniciado');
        console.log('Dados recebidos do PHP:', wpformsQuizData);
        console.log('Respostas configuradas:', this.respostas);
        console.groupEnd();
        
        this.pontos = 0;
        this.respostas = wpformsQuizData.respostas;
        this.estadoRespostas = {};
        
        this.init();
    }

    init() {
        console.group('🔄 Inicializando componentes');
        this.setupEventListeners();
        this.atualizarPontos();
        console.groupEnd();
    }

    calcularNotaDezena() {
        const totalPerguntas = Object.keys(this.respostas).length;
        return Math.round((this.pontos / totalPerguntas) * 10);
    }

    atualizarPontos() {
        console.group('📊 Atualizando Pontuação');
        const inputNota = document.querySelector('.cond input[type="number"]');
        const divsResultado = document.querySelectorAll('.option-tot');
        
        console.log('Input nota encontrado:', inputNota);
        console.log('Divs resultado encontradas:', divsResultado);
        
        if (inputNota) {
            const notaDezena = this.calcularNotaDezena();
            const notaFinal = Math.max(0, Math.min(notaDezena, 10));
            
            console.log('Nota calculada:', notaDezena);
            console.log('Nota final ajustada:', notaFinal);
            
            inputNota.value = notaFinal;
            inputNota.setAttribute('value', notaFinal);
            inputNota.readOnly = true;
            inputNota.style.display = 'none';

            divsResultado.forEach(div => {
                div.textContent = `${notaFinal}`;
            });
            
            const event = new Event('change', { bubbles: true });
            inputNota.dispatchEvent(event);
        }
        console.groupEnd();
    }

    checkSelected(fieldId, value) {
        console.group('✨ Verificando Resposta');
        console.log('Field ID:', fieldId);
        console.log('Valor selecionado:', value);
        console.log('Resposta correta:', this.respostas[fieldId]);
        console.log('Estado atual:', this.estadoRespostas);
        console.log('Pontos atuais:', this.pontos);
        
        if (this.respostas[fieldId] === value) {
            console.log('✅ Resposta correta!');
            if (!this.estadoRespostas[fieldId]) {
                this.pontos += 1;
                this.estadoRespostas[fieldId] = true;
                console.log('Pontos atualizados:', this.pontos);
                this.atualizarPontos();
            }
        } else if (this.estadoRespostas[fieldId]) {
            console.log('❌ Resposta incorreta!');
            this.pontos -= 1;
            this.estadoRespostas[fieldId] = false;
            console.log('Pontos atualizados:', this.pontos);
            this.atualizarPontos();
        }
        console.groupEnd();
    }

    setupEventListeners() {
        document.addEventListener('change', (e) => {
            const field = e.target.closest('.wpforms-field-radio, .wpforms-field-select');
            if (field) {
                const fieldId = field.getAttribute('data-field-id');
                this.checkSelected(fieldId, e.target.value);
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 DOM Carregado - Iniciando WPForms Quiz Score');
    new WPFormsQuizScore();
}); 