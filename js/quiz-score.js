class WPFormsQuizScore {
    constructor() {
        console.group('🎯 WPForms Quiz Score - Inicialização');
        
        // Inicializa variáveis
        this.pontos = 0;
        this.totalPerguntas = 0;
        this.respostasCorretas = wpformsQuizData.respostas || {};
        
        // Debug
        console.log('Respostas corretas carregadas:', this.respostasCorretas);
        
        // Inicializa eventos
        this.initEventos();
        console.groupEnd();
    }

    initEventos() {
        // Para campos de rádio
        document.querySelectorAll('input[type="radio"]').forEach(input => {
            input.addEventListener('change', (e) => this.verificarResposta(e));
        });

        // Para campos select
        document.querySelectorAll('select').forEach(select => {
            select.addEventListener('change', (e) => this.verificarResposta(e));
        });
    }

    verificarResposta(event) {
        const input = event.target;
        const fieldId = this.getFieldId(input);
        const respostaSelecionada = input.value;
        
        console.group('🔍 Verificando Resposta');
        console.log({
            campo: fieldId,
            selecionada: respostaSelecionada,
            correta: this.respostasCorretas[fieldId]
        });

        if (this.respostasCorretas[fieldId] === respostaSelecionada) {
            console.log('✅ Resposta correta!');
            this.marcarCorreta(input);
            this.pontos++;
        } else {
            console.log('❌ Resposta incorreta');
            this.marcarIncorreta(input);
        }

        this.atualizarPontuacao();
        console.groupEnd();
    }

    getFieldId(element) {
        // Extrai o ID do campo do nome do input
        const match = element.name.match(/wpforms\[fields\]\[(\d+)\]/);
        return match ? match[1] : null;
    }

    marcarCorreta(element) {
        const container = element.closest('.wpforms-field');
        container.classList.add('resposta-correta');
        container.classList.remove('resposta-incorreta');
    }

    marcarIncorreta(element) {
        const container = element.closest('.wpforms-field');
        container.classList.add('resposta-incorreta');
        container.classList.remove('resposta-correta');
    }

    atualizarPontuacao() {
        const totalPerguntas = Object.keys(this.respostasCorretas).length;
        const percentual = (this.pontos / totalPerguntas) * 100;
        
        console.log(`Pontuação: ${this.pontos}/${totalPerguntas} (${percentual}%)`);
        
        // Atualiza o campo de pontuação se existir
        const pontuacaoInput = document.querySelector('input[name="wpforms[fields][pontuacao]"]');
        if (pontuacaoInput) {
            pontuacaoInput.value = `${this.pontos}/${totalPerguntas} (${percentual.toFixed(1)}%)`;
        }
    }
}

// Inicializa quando o documento estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    new WPFormsQuizScore();
});

// Adicione isso dentro do método add_settings_script()
$('#save-quiz-settings').on('click', function(e) {
    e.preventDefault();
    
    var $button = $(this);
    var $spinner = $button.next('.spinner');
    
    // Desabilita o botão e mostra o spinner
    $button.prop('disabled', true);
    $spinner.css('visibility', 'visible');
    
    // Coleta todas as respostas selecionadas
    var settings = {};
    $('.quiz-question-settings select').each(function() {
        var name = $(this).attr('name');
        var value = $(this).val();
        if (value) { // Só envia se tiver valor selecionado
            settings[name] = value;
        }
    });
    
    // Debug
    console.group('💾 Salvando Configurações Quiz');
    console.log('Settings:', settings);
    
    // Envia para o servidor
    $.ajax({
        url: wpformsQuizData.ajaxurl,
        type: 'POST',
        data: {
            action: 'save_quiz_settings',
            settings: settings,
            nonce: wpformsQuizData.nonce
        },
        success: function(response) {
            console.log('Resposta:', response);
            if (response.success) {
                alert('Configurações salvas com sucesso!');
            } else {
                alert('Erro ao salvar configurações: ' + response.data.message);
            }
        },
        error: function(xhr, status, error) {
            console.error('Erro Ajax:', error);
            alert('Erro ao salvar configurações: ' + error);
        },
        complete: function() {
            // Reabilita o botão e esconde o spinner
            $button.prop('disabled', false);
            $spinner.css('visibility', 'hidden');
            console.groupEnd();
        }
    });
}); 