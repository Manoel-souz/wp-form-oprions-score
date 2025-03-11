// Garante que o jQuery está disponível antes de executar
(function ($) {
    class WPFormsQuizScore {
        constructor() {

            // Inicializa variáveis
            this.pontos = 0;
            this.totalPerguntas = 0;
            this.respostasCorretas = {};
            this.valorQuestao = 0;
            this.respostasAnteriores = {};
            this.respostasIncorretas = new Map(); // Store incorrect/partially correct answers
            this.respostasUsuario = new Map(); // Armazena todas as respostas do usuário
            this.timeoutPontuacao = null; // Timeout para processamento da pontuação

            // Busca as respostas do banco via AJAX
            this.carregarRespostasCorretas();

            // Inicializa eventos
            this.initEventos();
            this.initSaveScoreField();
            this.initScoreFieldSave();
        }

        carregarRespostasCorretas() {
            // Verifica se wpformsQuizData está disponível
            if (typeof wpformsQuizData === 'undefined') {
                return;
            }

            // Busca o ID do formulário no DOM
            let formId = null;
            window.formElement = document.querySelector('form[id^="wpforms-form-"]');

            if (formElement) {
                window.matches = formElement.id.match(/wpforms-form-(\d+)/);

                if (matches) {
                    formId = matches[1];
                }
            }

            if (!formId && wpformsQuizData.formId) {
                formId = wpformsQuizData.formId;
            }

            if (!formId) {
                return;
            }


            // Função para fazer a requisição AJAX
            const fazerRequisicao = () => {
                window.formId = formId;
                window.ajaxurl = wpformsQuizData.ajaxurl;

                return new Promise((resolve, reject) => {
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
                                this.respostasCorretas = {};

                                Object.entries(response.data).forEach(([key, value]) => {
                                    if (value.type === 'score_field') {
                                        wpformsQuizData.scoreFieldId = key;
                                        window.scoreFieldId = wpformsQuizData.scoreFieldId;
                                    } else if (value.type === 'incorrect_answers_field') {
                                        wpformsQuizData.incorrectAnswersFieldId = key;
                                        window.incorrectAnswersFieldId = wpformsQuizData.incorrectAnswersFieldId;
                                    } else {
                                        this.respostasCorretas[key] = {
                                            primary_answer: value.primary_answer || '',
                                            secondary_answer: value.secondary_answer || ''
                                        };
                                    }
                                });
                                
                                // Recalcula pontuações após carregar as respostas
                                this.recalcularTodasPontuacoes();
                                this.atualizarPontuacao();

                                resolve();
                            } else {
                                reject();
                            }
                        },
                        error: (error) => {
                            reject();
                        }
                    });
                });
            };

            // Faz duas requisições com intervalo de 2 segundos
            fazerRequisicao()
                .then(() => {
                    return new Promise(resolve => setTimeout(resolve, 2000));
                })
                .then(() => {
                    return fazerRequisicao();
                })
                .catch(error => {
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
            const respostaUsuario = input.value;
            
            // Get question label
            const questionLabel = this.getQuestionLabel(input);
            
            // Armazena a resposta do usuário
            this.respostasUsuario.set(fieldId, respostaUsuario);
            
            // Processa a pontuação após um pequeno delay
            clearTimeout(this.timeoutPontuacao);
            this.timeoutPontuacao = setTimeout(() => {
                // Atualiza o total de perguntas respondidas
                this.totalPerguntas = this.respostasUsuario.size;
                
                // Calculate value per question (baseado apenas nas perguntas respondidas)
                this.valorQuestao = 10 / this.totalPerguntas;
                
                // Recalcula todas as pontuações
                this.recalcularTodasPontuacoes();
                
                // Clear previous entry for this question
                this.respostasIncorretas.delete(fieldId);

                // Verifica a resposta atual
                const respostas = this.respostasCorretas[fieldId];
                
                if (!respostas) {
                    return;
                }

                if (respostaUsuario === respostas.primary_answer) {
                    // Primary answer correct - full value
                    this.marcarCorreta(input);
                    this.respostasAnteriores[fieldId] = this.valorQuestao;
                } else {
                    // Store information about incorrect/partially correct answer
                    this.respostasIncorretas.set(fieldId, {
                        pergunta: questionLabel,
                        respostaUsuario: respostaUsuario,
                        respostaCorreta: respostas.primary_answer,
                        respostaSecundaria: respostas.secondary_answer
                    });

                    if (respostaUsuario === respostas.secondary_answer) {
                        // Secondary answer correct - half value
                        this.marcarCorreta(input);
                        this.respostasAnteriores[fieldId] = this.valorQuestao / 2;
                    } else {
                        // Incorrect answer - 1/6 value
                        this.marcarIncorreta(input);
                        this.respostasAnteriores[fieldId] = this.valorQuestao / 6;
                    }
                }

                // Update incorrect answers display
                this.atualizarRespostasIncorretas();
                
                // Atualiza a pontuação
                this.atualizarPontuacao();
            }, 500);
        }

        recalcularTodasPontuacoes() {
            // Zera a pontuação
            this.pontos = 0;
            
            // Recalcula com base em todas as respostas dadas
            for (const [fieldId, respostaUsuario] of this.respostasUsuario.entries()) {
                const respostas = this.respostasCorretas[fieldId];
                
                if (!respostas) continue;
                
                if (respostaUsuario === respostas.primary_answer) {
                    // Resposta primária correta - valor total
                    this.pontos += this.valorQuestao;
                } else if (respostaUsuario === respostas.secondary_answer) {
                    // Resposta secundária correta - metade do valor
                    this.pontos += this.valorQuestao / 2;
                } else {
                    // Resposta incorreta - 1/6 do valor
                    this.pontos += this.valorQuestao / 6;
                }
            }
            
            // Arredonda para uma casa decimal
            this.pontos = Math.round(this.pontos * 10) / 10;
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

        marcarIncorreta(element, classes = {
            container: '.wpforms-field',
            incorreta: 'resposta-incorreta',
            correta: 'resposta-correta'
        }) {
            const container = element.closest(classes.container);
            if (!container) return;

            // Remove todas as classes de estado anteriores
            container.classList.remove(classes.correta);

            // Adiciona a classe de incorreta
            container.classList.add(classes.incorreta);

            // Dispara evento personalizado
            container.dispatchEvent(new CustomEvent('respostaIncorreta', {
                bubbles: true,
                detail: { element, container }
            }));
        }

        atualizarPontuacao() {
            // Usa this.pontos ao invés de window.pontos
            const notaDecimal = this.pontos;
            const notaInteira = Math.round(notaDecimal);
            
            // Tenta encontrar o campo de pontuação
            const possiveisElementos = [
                document.querySelector(`#wpforms-${formId}-field_${wpformsQuizData.scoreFieldId}`),
                document.querySelector(`#wpforms-field_${wpformsQuizData.scoreFieldId}`),
                document.querySelector(`[data-field="${wpformsQuizData.scoreFieldId}"]`),
                document.querySelector('.quiz-score-display'),
                document.querySelector('#quiz-score')
            ];

            // Usa o primeiro elemento válido encontrado
            const scoreField = possiveisElementos.find(elem => elem !== null);

            if (scoreField) {
                try {
                    if (scoreField.tagName === 'INPUT') {
                        scoreField.value = notaInteira;
                        scoreField.dispatchEvent(new Event('change', { bubbles: true }));
                    } else {
                        scoreField.textContent = notaDecimal.toFixed(1);
                    }
                } catch (erro) {
                }
            }

            // Atualiza displays adicionais
            document.querySelectorAll('.quiz-score-display').forEach(display => {
                display.textContent = notaDecimal.toFixed(1);
            });
        }

        extrairFieldId(elemento) {
            // Tenta diferentes padrões para extrair o field_id
            const patterns = [
                /wpforms\[fields\]\[(\d+)\]/, // Padrão do name
                /wpforms-\d+-field_(\d+)/,    // Padrão do ID
                /field_(\d+)/                 // Padrão simplificado
            ];

            let fieldId = null;

            // Tenta pelo name primeiro
            if (elemento.name) {
                for (const pattern of patterns) {
                    const match = elemento.name.match(pattern);
                    if (match) {
                        fieldId = match[1];
                        break;
                    }
                }
            }

            // Se não encontrou pelo name, tenta pelo ID
            if (!fieldId && elemento.id) {
                for (const pattern of patterns) {
                    const match = elemento.id.match(pattern);
                    if (match) {
                        fieldId = match[1];
                        break;
                    }
                }
            }

            return fieldId;
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
            if (!formId || !fieldId) {
                return;
            }

            const data = new FormData();
            data.append('action', 'save_quiz_score_field');
            data.append('nonce', wpformsQuizData.nonce); 
            data.append('form_id', formId);
            data.append('field_id', fieldId);

            $.ajax({
                url: wpformsQuizData.ajaxurl,
                method: 'POST',
            data: data,
                processData: false,
                contentType: false,
                success: (response) => {
                    if (response.success) {
                    }
                },
                error: (error) => {
                },
                complete: () => {
                }
            });
        }

        initScoreFieldSave() {
            
            const saveButton = $('#save-quiz-settings');
            const scoreSelect = $('#quiz_score_field');
            const incorrectAnswersSelect = $('#quiz_incorrect_answers_field');

            if (saveButton.length && (scoreSelect.length || incorrectAnswersSelect.length)) {
                saveButton.on('click', (e) => {
                    e.preventDefault();

                    // Obtém os dados do formulário
                    const formId = scoreSelect.data('form-id') || incorrectAnswersSelect.data('form-id');
                    const settings = {};

                    // Salva campo de pontuação
                    const scoreFieldId = scoreSelect.val();
                    if (scoreFieldId) {
                        settings.score_field = {
                            form_id: formId,
                            field_id: scoreFieldId,
                            type: 'score_field',
                            correct_answer: '',
                            second_answer: ''
                        };
                    }

                    // Salva campo de respostas incorretas
                    const incorrectAnswersFieldId = incorrectAnswersSelect.val();
                    if (incorrectAnswersFieldId) {
                        settings.incorrect_answers_field = {
                            form_id: formId,
                            field_id: incorrectAnswersFieldId,
                            type: 'incorrect_answers_field',
                            correct_answer: '',
                            second_answer: ''
                        };
                    }

                    // Group selects by field_id para respostas do quiz
                    $('.quiz-question-settings').each(function() {
                        const $container = $(this);
                        const fieldId = $container.find('.primary-answer').data('field-id');
                        const primaryAnswer = $container.find('.primary-answer').val();
                        const secondaryAnswer = $container.find('.secondary-answer').val();

                        if (primaryAnswer || secondaryAnswer) {
                            settings['quiz_answer_' + fieldId] = {
                                form_id: formId,
                                field_id: fieldId,
                                type: 'quiz_answer',
                                primary_answer: primaryAnswer || '',
                                secondary_answer: secondaryAnswer || ''
                            };
                        }
                    });

                    if (Object.keys(settings).length === 0) {
                        alert('Selecione pelo menos uma resposta ou campo de exibição');
                        return;
                    }


                    // Mostra loading
                    const $spinner = saveButton.next('.spinner');
                    saveButton.prop('disabled', true);
                    $spinner.css('visibility', 'visible');

                    // Envia para o servidor
                    $.ajax({
                        url: wpformsQuizData.ajaxurl,
                        type: 'POST',
                        data: {
                            action: 'save_quiz_settings',
                            nonce: wpformsQuizData.nonce,
                            form_id: formId,
                            settings: settings
                        },
                        success: function(response) {
                            if (response.success) {
                                alert('Configurações salvas com sucesso!');
                                // Atualiza os IDs globais após salvar com sucesso
                                if (settings.score_field) {
                                    wpformsQuizData.scoreFieldId = settings.score_field.field_id;
                                }
                                if (settings.incorrect_answers_field) {
                                    wpformsQuizData.incorrectAnswersFieldId = settings.incorrect_answers_field.field_id;
                                }
                            } else {
                                alert('Erro ao salvar: ' + (response.data?.message || 'Erro desconhecido'));
                            }
                        },
                        error: function(xhr, status, error) {
                            alert('Erro ao salvar configurações');
                        },
                        complete: () => {
                            saveButton.prop('disabled', false);
                            $spinner.css('visibility', 'hidden');
                        }
                    });
                });
            }
            
        }

        showNotification(message, type = 'success') {
            const notification = document.createElement('div');
            notification.className = `wpforms-notification wpforms-notification-${type}`;
            notification.style.cssText = `
                position: fixed;
                top: 32px;
                right: 20px;
                padding: 10px 20px;
                border-radius: 4px;
                background: ${type === 'success' ? '#46b450' : '#dc3232'};
                color: white;
                z-index: 9999;
                box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            `;
            notification.textContent = message;

            document.body.appendChild(notification);

            setTimeout(() => {
                notification.style.opacity = '0';
                notification.style.transition = 'opacity 0.5s ease';
                setTimeout(() => notification.remove(), 500);
            }, 3000);
        }

        atualizarDisplays(notaDecimal) {
            
            // Atualiza displays da pontuação
            const displays = document.querySelectorAll('.quiz-score-display');
            
            if (displays.length === 0) {
                return;
            }

            displays.forEach(display => {
                display.textContent = notaDecimal.toFixed(1);
            });

            // Dispara evento de atualização
            document.dispatchEvent(new CustomEvent('quizScoreDisplayUpdated', {
                detail: { score: notaDecimal }
            }));
        }

        getQuestionLabel(input) {
            // Try to find the question label
            const fieldContainer = input.closest('.wpforms-field');
            if (fieldContainer) {
                const label = fieldContainer.querySelector('.wpforms-field-label');
                if (label) {
                    return label.textContent.trim();
                }
            }
            return `Questão ${this.getFieldId(input)}`;
        }

        atualizarRespostasIncorretas() {
            // Busca tanto o container quanto o campo textarea
            const container = document.querySelector('.quiz-incorrect-answers');
            const textareaField = document.querySelector(`#wpforms-${formId}-field_${wpformsQuizData.incorrectAnswersFieldId}`);
            
            // Atualiza o total de perguntas respondidas
            let conteudoRespostas = '';

            if (this.respostasIncorretas.size === 0) {
                conteudoRespostas = 'Todas as respostas estão completamente corretas!';
            } else {
                // Cria lista de respostas incorretas/parcialmente corretas
                const respostasFormatadas = [];
                
                this.respostasIncorretas.forEach((info) => {
                    respostasFormatadas.push(
                        `Questão: ${info.pergunta}\n` +
                        `Sua resposta: ${info.respostaUsuario}\n` +
                        `Resposta esperada: ${info.respostaCorreta} ${info.respostaSecundaria ? `ou ${info.respostaSecundaria}` : ''} \n`
                    );
                });
                
                conteudoRespostas = respostasFormatadas.join('\n');
            }

            // Atualiza o container se existir
            if (container) {
                container.innerHTML = `<pre>${conteudoRespostas}</pre>`;
            }

            // Atualiza o campo textarea se existir
            if (textareaField) {
                textareaField.value = conteudoRespostas;
                // Dispara evento de mudança para garantir que o formulário detecte a alteração
                textareaField.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
    }

    // Inicializa quando o documento estiver pronto
    $(document).ready(() => {
        new WPFormsQuizScore();
    });

    // Substitua o evento de salvar existente por este
    $('#save-quiz-settings').on('click', function (e) {
        e.preventDefault();

        const $button = $(this);
        const $spinner = $button.next('.spinner');

        // Desabilita o botão e mostra o spinner
        $button.prop('disabled', true);
        $spinner.css('visibility', 'visible');

        // Coleta todas as respostas selecionadas
        const settings = {};
        $('.quiz-question-settings select').each(function () {
            const $select = $(this);
            const formId = $select.data('form-id');
            const fieldId = $select.data('field-id');
            const answer = $select.val();

            if (answer) {
                settings[`quiz_correct_answer_${fieldId}`] = {
                    form_id: formId,
                    field_id: fieldId,
                    answer: answer
                };
            }
        });


        // Envia para o servidor
        $.ajax({
            url: wpformsQuizData.ajaxurl,
            type: 'POST',
            data: {
                action: 'save_quiz_settings',
                settings: settings,
                nonce: wpformsQuizData.nonce,
                form_id: wpformsQuizData.formId // Adiciona o form_id explicitamente
            },
            success: function (response) {
                if (response.success) {
                    alert('Configurações salvas com sucesso!');
                } else {
                    alert('Erro ao salvar: ' + (response.data?.message || 'Erro desconhecido'));
                }
            },
            error: function (error) {
                alert('Erro ao salvar configurações');
            },
            complete: function () {
                $button.prop('disabled', false);
                $spinner.css('visibility', 'hidden');
            }
        });
    });
})(jQuery); 