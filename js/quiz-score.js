class WPFormsQuizScore {
    constructor() {
        this.pontos = 0;
        this.respostas = wpformsQuizData.respostas;
        this.estadoRespostas = {};
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.atualizarPontos();
    }

    calcularNotaDezena() {
        const totalPerguntas = Object.keys(this.respostas).length;
        return Math.round((this.pontos / totalPerguntas) * 10);
    }

    atualizarPontos() {
        const inputNota = document.querySelector('.cond input[type="number"]');
        const divsResultado = document.querySelectorAll('.option-tot');
        
        if (inputNota) {
            const notaDezena = this.calcularNotaDezena();
            const notaFinal = Math.max(0, Math.min(notaDezena, 10));
            
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
    }

    checkSelected(fieldId, value) {
        if (this.respostas[fieldId] === value) {
            if (!this.estadoRespostas[fieldId]) {
                this.pontos += 1;
                this.estadoRespostas[fieldId] = true;
                this.atualizarPontos();
            }
        } else if (this.estadoRespostas[fieldId]) {
            this.pontos -= 1;
            this.estadoRespostas[fieldId] = false;
            this.atualizarPontos();
        }
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
    new WPFormsQuizScore();
}); 