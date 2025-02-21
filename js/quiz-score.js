// Garante que o jQuery está disponível antes de executar
(function($) {
    class WPFormsQuizScore {
        constructor() {
            console.group('🎯 WPForms Quiz Score - Inicialização');
            
            // Inicializa variáveis
            this.pontos = 0;
            this.totalPerguntas = 0;
            this.respostasCorretas = {};
            this.valorQuestao = 0;
            this.respostasAnteriores = {};
            
            // Busca as respostas do banco via AJAX
            this.carregarRespostasCorretas();
            
            // Inicializa eventos
            this.initEventos();
            this.initSaveScoreField();
            console.groupEnd();
        }

        carregarRespostasCorretas() {
            // Verifica se wpformsQuizData está disponível
            if (typeof wpformsQuizData === 'undefined') {
                console.error('❌ wpformsQuizData não está definido');
                return;
            }

            // Busca o formulário e verifica se existe
            const form = document.querySelector('form.wpforms-form');
            if (!form) {
                console.error('❌ Formulário não encontrado');
                return;
            }

            // Obtém o ID do formulário de diferentes maneiras possíveis
            const formId = form.dataset.formid || 
                          form.getAttribute('data-formid') || 
                          form.id.replace('wpforms-form-', '') ||
                          '8'; // Fallback para o ID que sabemos que existe

            console.log('🔧 Dados disponíveis:', {
                ajaxurl: wpformsQuizData.ajaxurl,
                nonce: wpformsQuizData.nonce,
                formId: formId
            });

            // Faz a requisição AJAX
            $.ajax({
                url: wpformsQuizData.ajaxurl,
                type: 'POST',
                dataType: 'json',
                data: {
                    action: 'get_quiz_answers',
                    form_id: formId,
                    nonce: wpformsQuizData.nonce
                },
                success: (response) => {
                    if (response && response.success) {
                        this.respostasCorretas = response.data;
                        console.log('✅ Respostas corretas carregadas:', this.respostasCorretas);
                    } else {
                        console.error('❌ Erro ao carregar respostas:', 
                            response ? response.data.message : 'Resposta inválida');
                    }
                },
                error: (xhr, status, error) => {
                    console.error('❌ Erro na requisição AJAX:', {
                        status: status,
                        error: error,
                        responseText: xhr.responseText,
                        url: wpformsQuizData.ajaxurl,
                        data: {
                            action: 'get_quiz_answers',
                            form_id: formId,
                            nonce: wpformsQuizData.nonce
                        }
                    });
                }
            });
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
            
            // Calcula o valor de cada questão (nota máxima 10 dividida pelo número de questões)
            const totalQuestoes = Object.keys(this.respostasCorretas).length;
            this.valorQuestao = 10 / totalQuestoes;
            
            console.group('🔍 Verificando Resposta');
            console.log({
                campo: fieldId,
                selecionada: respostaSelecionada,
                correta: this.respostasCorretas[fieldId],
                valorQuestao: this.valorQuestao
            });

            // Remove pontos anteriores desta questão se houver
            if (this.respostasAnteriores && this.respostasAnteriores[fieldId]) {
                this.pontos -= this.respostasAnteriores[fieldId];
            }

            // Inicializa objeto de respostas anteriores se não existir
            if (!this.respostasAnteriores) {
                this.respostasAnteriores = {};
            }

            if (this.respostasCorretas[fieldId] === respostaSelecionada) {
                console.log('✅ Resposta correta!');
                this.marcarCorreta(input);
                this.respostasAnteriores[fieldId] = this.valorQuestao;
                this.pontos += this.valorQuestao;
            } else {
                console.log('❌ Resposta incorreta');
                this.marcarIncorreta(input);
                this.respostasAnteriores[fieldId] = 0;
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
            // Calcula a nota com uma casa decimal para display
            const notaDecimal = Math.round(this.pontos * 10) / 10;
            // Converte para inteiro para o campo number
            const notaInteira = Math.round(notaDecimal);
            
            // Debug inicial
            console.group('🎯 Debug Pontuação Quiz');
            console.log(`Pontuação: ${notaDecimal}/10 (Valor inteiro: ${notaInteira})`);
            
            // Busca o formulário e verifica se existe
            const form = document.querySelector('form.wpforms-form');
            if (!form) {
                console.error('❌ Formulário não encontrado');
                console.groupEnd();
                return;
            }

            // Obtém o ID do formulário de diferentes maneiras possíveis
            const formId = form.dataset.formid || 
                          form.getAttribute('data-formid') || 
                          form.id.replace('wpforms-form-', '') ||
                          '8'; // Fallback para o ID que sabemos que existe

            console.log('🔧 Dados disponíveis:', {
                ajaxurl: wpformsQuizData.ajaxurl,
                nonce: wpformsQuizData.nonce,
                formId: formId
            });

            // Busca o campo selecionado para pontuação usando o ID correto
            const scoreFieldId = wpformsQuizData.scoreFieldId;
            
            // Tenta diferentes padrões de seletores
            const possiveisSeletores = [
                `#wpforms-${formId}-field_${scoreFieldId}-container input[type="number"]`,
                `#wpforms-${formId}-field_${scoreFieldId} input[type="number"]`,
                `#wpforms-${formId}-field_${scoreFieldId}`,
                `[name="wpforms[fields][${scoreFieldId}]"]`,
                `input[name="wpforms[fields][${scoreFieldId}]"]`
            ];

            console.log('🔍 Tentando seletores:', possiveisSeletores);

            let scoreField = null;
            for (const seletor of possiveisSeletores) {
                const campo = document.querySelector(seletor);
                if (campo) {
                    scoreField = campo;
                    console.log('✅ Campo encontrado com seletor:', seletor);
                    break;
                }
            }

            if (scoreField) {
                console.log('✅ Campo de pontuação encontrado:', {
                    elemento: scoreField,
                    id: scoreField.id,
                    name: scoreField.name,
                    value: scoreField.value,
                    novoValor: notaInteira
                });
                
                scoreField.value = notaInteira;
                const event = new Event('change', { bubbles: true });
                scoreField.dispatchEvent(event);
            } else {
                console.error('❌ Campo não encontrado. Debug:', {
                    formId: formId,
                    scoreFieldId: scoreFieldId,
                    seletoresTentados: possiveisSeletores,
                    todosInputs: Array.from(document.querySelectorAll('input[type="number"]')).map(el => ({
                        id: el.id,
                        name: el.name,
                        container: el.closest('[id*="wpforms"]')?.id
                    }))
                });
            }
            
            // Atualiza displays da nota
            const displays = document.querySelectorAll(`.quiz-score-display[data-form-id="${formId}"]`);
            displays.forEach(display => {
                display.textContent = notaDecimal;
            });
            
            console.groupEnd();
        }

        initSaveScoreField() {
            // Quando o campo de pontuação é selecionado no admin
            const scoreFieldSelect = document.querySelector('#quiz_score_field');
            if (scoreFieldSelect) {
                scoreFieldSelect.addEventListener('change', (e) => {
                    this.saveScoreField(e.target.value);
                });
            }
        }

        saveScoreField(fieldId) {
            const formId = new URLSearchParams(window.location.search).get('form_id');
            console.group('🎯 Salvando Campo de Pontuação');
            console.log('Dados:', {
                formId: formId,
                fieldId: fieldId
            });

            if (!formId || !fieldId) {
                console.error('❌ IDs inválidos');
                console.groupEnd();
                return;
            }

            const data = new FormData();
            data.append('action', 'save_quiz_score_field');
            data.append('nonce', wpformsQuizData.nonce);
            data.append('form_id', formId);
            data.append('field_id', fieldId);

            fetch(wpformsQuizData.ajaxurl, {
                method: 'POST',
                body: data
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    console.log('✅ Resposta do servidor:', data);
                } else {
                    console.error('❌ Erro do servidor:', data);
                }
                console.groupEnd();
            })
            .catch(error => {
                console.error('❌ Erro na requisição:', error);
                console.groupEnd();
            });
        }
    }

    // Inicializa quando o documento estiver pronto
    $(document).ready(() => {
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
})(jQuery); 