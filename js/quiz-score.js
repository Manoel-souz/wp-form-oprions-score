// Garante que o jQuery está disponível antes de executar
(function ($) {
    class WPFormsQuizScore {
        constructor() {
            console.group('🎯 WPForms Quiz Score - Inicialização');

            // Inicializa variáveis
            this.pontos = 0;
            this.totalPerguntas = 0;
            this.respostasCorretas = {};
            this.valorQuestao = 0;
            this.respostasAnteriores = {};
            this.respostasIncorretas = new Map(); // Store incorrect/partially correct answers

            // Busca as respostas do banco via AJAX
            this.carregarRespostasCorretas();

            // Inicializa eventos
            this.initEventos();
            this.initSaveScoreField();
            this.initScoreFieldSave();
            console.groupEnd();
        }

        carregarRespostasCorretas() {
            // Verifica se wpformsQuizData está disponível
            if (typeof wpformsQuizData === 'undefined') {
                console.error('❌ wpformsQuizData não está definido');
                return;
            }

            // Busca o ID do formulário no DOM
            let formId = null;
            console.log('🔍 Iniciando busca do formId...');

            window.formElement = document.querySelector('form[id^="wpforms-form-"]');
            console.log('🔍 Form element encontrado:', formElement);

            if (formElement) {
                console.log('🔍 ID do form element:', formElement.id);
                window.matches = formElement.id.match(/wpforms-form-(\d+)/);
                console.log('🔍 Matches do regex:', matches);

                if (matches) {
                    formId = matches[1];
                    console.log('✅ Form ID encontrado no DOM:', formId);
                } else {
                    console.warn('⚠️ Regex não encontrou matches no ID do form');
                }
            } else {
                console.warn('⚠️ Form element não encontrado no DOM');
            }

            // Fallback para wpformsQuizData
            console.log('🔍 Verificando wpformsQuizData:', wpformsQuizData);

            if (!formId && wpformsQuizData.formId) {
                formId = wpformsQuizData.formId;
                console.log('✅ Form ID obtido do wpformsQuizData:', formId);
            } else if (!formId) {
                console.error('❌ Nenhum form ID encontrado em nenhuma fonte');
            }

            if (!formId) {
                console.error('❌ ID do formulário não encontrado - Abortando carregamento');
                return;
            }

            console.log('📝 Preparando para carregar respostas do form:', formId);

            // Função para fazer a requisição AJAX
            const fazerRequisicao = () => {
                console.group('🔄 Iniciando requisição AJAX');
                console.log('URL:', wpformsQuizData.ajaxurl);
                console.log('Form ID:', formId);
                console.log('Nonce:', wpformsQuizData.nonce);
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
                            console.log('✅ Resposta recebida:', response);
                            if (response && response.success) {
                                this.respostasCorretas = {};

                                Object.entries(response.data).forEach(([key, value]) => {
                                    console.log('🔍 Processando resposta:', { key, value });
                                    if (value.type === 'score_field') {
                                        wpformsQuizData.scoreFieldId = key;
                                        window.scoreFieldId = wpformsQuizData.scoreFieldId;
                                        console.log('🔍 scoreFieldId:', window.scoreFieldId);
                                        console.log('📊 Campo de pontuação definido:', key);
                                    } else {
                                        this.respostasCorretas[key] = {
                                            primary_answer: value.primary_answer || '',
                                            secondary_answer: value.secondary_answer || ''
                                        };
                                        console.log('✅ Resposta registrada:', {
                                            campo: key,
                                            primaria: value.primary_answer,
                                            secundaria: value.secondary_answer
                                        });
                                    }
                                });

                                console.log('✅ Todas respostas processadas:', this.respostasCorretas);
                                resolve();
                            } else {
                                console.error('❌ Erro na resposta:', response);
                                reject();
                            }
                        },
                        error: (error) => {
                            console.error('❌ Erro na requisição:', error);
                            reject();
                        }
                    });
                });
            };

            // Faz duas requisições com intervalo de 2 segundos
            fazerRequisicao()
                .then(() => {
                    console.log('🔄 Primeira requisição concluída');
                    return new Promise(resolve => setTimeout(resolve, 2000));
                })
                .then(() => {
                    console.log('🔄 Iniciando segunda requisição...');
                    return fazerRequisicao();
                })
                .catch(error => {
                    console.error('❌ Erro nas requisições:', error);
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
            
            // Calculate value per question
            const totalQuestoes = Object.keys(this.respostasCorretas).length;
            this.valorQuestao = 10 / totalQuestoes;

            // Remove previous points for this question if any
            if (this.respostasAnteriores && this.respostasAnteriores[fieldId]) {
                this.pontos -= this.respostasAnteriores[fieldId];
            }

            // Initialize previous answers object if it doesn't exist
            if (!this.respostasAnteriores) {
                this.respostasAnteriores = {};
            }

            const respostas = this.respostasCorretas[fieldId];
            
            if (!respostas) {
                console.warn('⚠️ Nenhuma resposta encontrada para o campo:', fieldId);
                return;
            }

            // Clear previous entry for this question
            this.respostasIncorretas.delete(fieldId);

            if (respostaUsuario === respostas.primary_answer) {
                // Primary answer correct - full value
                this.marcarCorreta(input);
                this.respostasAnteriores[fieldId] = this.valorQuestao;
                this.pontos += this.valorQuestao;
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
                    this.pontos += this.valorQuestao / 2;
                } else {
                    // Incorrect answer - 1/6 value
                    this.marcarIncorreta(input);
                    this.respostasAnteriores[fieldId] = this.valorQuestao / 6;
                    this.pontos += this.valorQuestao / 6;
                }
            }

            // Update incorrect answers display
            this.atualizarRespostasIncorretas();
            
            // Round to one decimal place
            this.pontos = Math.round(this.pontos * 10) / 10;
            
            this.atualizarPontuacao();
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
            console.group('🎯 Atualizando Pontuação');

            // Usa this.pontos ao invés de window.pontos
            const notaDecimal = Math.round(this.pontos * 10) / 10;
            const notaInteira = Math.round(notaDecimal);
            
            console.log('📊 Dados:', {
                pontos: this.pontos,
                notaDecimal: notaDecimal,
                notaInteira: notaInteira,
                formId: wpformsQuizData.formId,
                scoreFieldId: wpformsQuizData.scoreFieldId
            });

            // Tenta encontrar o campo de pontuação
            // Log do seletor específico para debug
            console.log('🔍 Buscando campo:', `#wpforms-${formId}-field_${wpformsQuizData.scoreFieldId}`);
            console.log('🔍 Elemento encontrado:', document.querySelector(`#wpforms-${formId}-field_${wpformsQuizData.scoreFieldId}`));

            const possiveisElementos = [
                document.querySelector(`#wpforms-${formId}-field_${wpformsQuizData.scoreFieldId}`),
                document.querySelector(`#wpforms-field_${wpformsQuizData.scoreFieldId}`),
                document.querySelector(`[data-field="${wpformsQuizData.scoreFieldId}"]`),
                document.querySelector('.quiz-score-display'),
                document.querySelector('#quiz-score')
            ];

            // Usa o primeiro elemento válido encontrado
            const scoreField = possiveisElementos.find(elem => elem !== null);
            console.log('🔍 Campo de pontuação encontrado bojasjopd:', scoreField);

            if (scoreField) {
                try {
                    if (scoreField.tagName === 'INPUT') {
                        scoreField.value = notaInteira;
                        scoreField.dispatchEvent(new Event('change', { bubbles: true }));
                    } else {
                        scoreField.textContent = notaDecimal.toFixed(1);
                    }
                    console.log('✅ Pontuação atualizada:', scoreField);
                } catch (erro) {
                    console.error('❌ Erro ao atualizar pontuação:', erro);
                }
            } else {
                console.warn('⚠️ Campo de pontuação não encontrado');
            }

            // Atualiza displays adicionais
            document.querySelectorAll('.quiz-score-display').forEach(display => {
                display.textContent = notaDecimal.toFixed(1);
            });

            console.groupEnd();
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
                console.error('❌ IDs inválidos');
                console.groupEnd();
                return;
            }

            const data = new FormData();
            data.append('action', 'save_quiz_score_field');
            data.append('nonce', wpformsQuizData.nonce); 
            data.append('form_id', formId);
            data.append('field_id', fieldId);
            console.log('🔍 Dados enviados:', data);
            console.log('🔍 URL:', wpformsQuizData.ajaxurl);
            console.log('🔍 ajaxurl:', ajaxurl);
            console.log('🔍 Form ID:', formId);
            console.log('🔍 Field ID:', fieldId);
            console.log('🔍 Nonce:', wpformsQuizData.nonce);

            $.ajax({
                url: wpformsQuizData.ajaxurl,
                method: 'POST',
            data: data,
                processData: false,
                contentType: false,
                success: (response) => {
                    if (response.success) {
                        console.log('✅ Resposta do servidor:', response);
                    } else {
                        console.error('❌ Erro do servidor:', response);
                    }
                },
                error: (error) => {
                    console.error('❌ Erro na requisição:', error);
                    console.log('🔍 Dados enviados:', data);
                    console.log('🔍 URL:', wpformsQuizData.ajaxurl);
                    console.log('🔍 ajaxurl:', ajaxurl);
                    console.log('🔍 Form ID:', formId);
                    console.log('🔍 Field ID:', fieldId);
                    console.log('🔍 Nonce:', wpformsQuizData.nonce);
                    console.log('🔍 wpformsQuizData:', wpformsQuizData);
                    
                    console.groupEnd();
                },
                complete: () => {
                    console.groupEnd();
                }
            });
        }

        initScoreFieldSave() {
            console.group('🔍 Inicializando salvamento do campo');
            
            const saveButton = $('#save-quiz-settings');
            const select = $('.quiz-answer-select');

            if (saveButton.length && select.length) {
                saveButton.on('click', (e) => {
                    e.preventDefault();
                    console.log('🔔 Botão clicado');

                    // Obtém os dados do formulário
                    const formId = select.first().data('form-id');
                    const settings = {};

                    // Group selects by field_id
                    $('.quiz-question-settings').each(function() {
                        const $container = $(this);
                        const fieldId = $container.find('.primary-answer').data('field-id');
                        const primaryAnswer = $container.find('.primary-answer').val();
                        const secondaryAnswer = $container.find('.secondary-answer').val();

                        if (primaryAnswer || secondaryAnswer) {
                            settings[fieldId] = {
                                form_id: formId,
                                field_id: fieldId,
                                primary_answer: primaryAnswer || '',
                                secondary_answer: secondaryAnswer || ''
                            };
                        }
                    });

                    if (Object.keys(settings).length === 0) {
                        alert('Selecione pelo menos uma resposta');
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
                            console.log('✅ Resposta:', response);
                            if (response.success) {
                                alert('Configurações salvas com sucesso!');
                            } else {
                                alert('Erro ao salvar: ' + (response.data?.message || 'Erro desconhecido'));
                            }
                        },
                        error: function(xhr, status, error) {
                            console.error('❌ Erro:', {xhr, status, error});
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
            console.group('🎯 Atualizando Displays');
            
            // Atualiza displays da pontuação
            const displays = document.querySelectorAll('.quiz-score-display');
            console.log('🔍 Buscando displays de pontuação');
            
            if (displays.length === 0) {
                console.warn('⚠️ Nenhum display encontrado');
                console.groupEnd();
                return;
            }

            console.log(`✅ ${displays.length} displays encontrados`);
            
            displays.forEach(display => {
                const oldValue = display.textContent;
                display.textContent = notaDecimal.toFixed(1);
                console.log(`📊 Display atualizado: ${oldValue} -> ${notaDecimal.toFixed(1)}`);
            });

            // Dispara evento de atualização
            document.dispatchEvent(new CustomEvent('quizScoreDisplayUpdated', {
                detail: { score: notaDecimal }
            }));

            console.groupEnd();
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
            const container = document.querySelector('.quiz-incorrect-answers');
            if (!container) return;

            // Clear current content
            container.innerHTML = '';

            if (this.respostasIncorretas.size === 0) {
                container.innerHTML = '<p>Todas as respostas estão completamente corretas!</p>';
                return;
            }

            // Create list of incorrect/partially correct answers
            const list = document.createElement('ul');
            list.className = 'quiz-incorrect-list';

            this.respostasIncorretas.forEach((info, fieldId) => {
                const item = document.createElement('li');
                item.className = 'quiz-incorrect-item';
                
                let status = 'incorreta';
                if (info.respostaUsuario === info.respostaSecundaria) {
                    status = 'parcialmente correta';
                }

                item.innerHTML = `
                    <div class="quiz-question">
                        <strong>${info.pergunta}</strong>
                    </div>
                    <div class="quiz-answer-info">
                        <span class="quiz-user-answer">Sua resposta: ${info.respostaUsuario}</span>
                        <span class="quiz-status">(${status})</span>
                    </div>
                `;

                list.appendChild(item);
            });

            container.appendChild(list);

            // Add some basic styles
            const style = document.createElement('style');
            style.textContent = `
                .quiz-incorrect-answers {
                    margin: 20px 0;
                    padding: 15px;
                    background: #f9f9f9;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                }
                .quiz-incorrect-list {
                    list-style: none;
                    padding: 0;
                    margin: 0;
                }
                .quiz-incorrect-item {
                    padding: 10px;
                    margin-bottom: 10px;
                    border-left: 3px solid #ff6b6b;
                    background: #fff;
                }
                .quiz-incorrect-item.partially-correct {
                    border-left-color: #ffd93d;
                }
                .quiz-question {
                    font-weight: bold;
                    margin-bottom: 5px;
                }
                .quiz-answer-info {
                    color: #666;
                    font-size: 0.9em;
                }
                .quiz-status {
                    display: inline-block;
                    margin-left: 10px;
                    padding: 2px 6px;
                    border-radius: 3px;
                    font-size: 0.8em;
                }
                .quiz-status.incorrect {
                    background: #ffe3e3;
                    color: #ff6b6b;
                }
                .quiz-status.partially-correct {
                    background: #fff3cd;
                    color: #856404;
                }
            `;
            document.head.appendChild(style);
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

        console.group('💾 Salvando Configurações Quiz');
        console.log('Settings:', settings);

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
                console.log('Resposta:', response);
                if (response.success) {
                    alert('Configurações salvas com sucesso!');
                } else {
                    alert('Erro ao salvar: ' + (response.data?.message || 'Erro desconhecido'));
                }
            },
            error: function (error) {
                console.error('Erro Ajax:', error);
                alert('Erro ao salvar configurações');
            },
            complete: function () {
                $button.prop('disabled', false);
                $spinner.css('visibility', 'hidden');
                console.groupEnd();
            }
        });
    });
})(jQuery); 