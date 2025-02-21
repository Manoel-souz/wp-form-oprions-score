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
            
            const formElement = document.querySelector('form[id^="wpforms-form-"]');
            console.log('🔍 Form element encontrado:', formElement);
            
            if (formElement) {
                console.log('🔍 ID do form element:', formElement.id);
                const matches = formElement.id.match(/wpforms-form-(\d+)/);
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
                                    console.log('🔍 Processando resposta:', {key, value});
                                    if (value.type === 'score_field') {
                                        wpformsQuizData.scoreFieldId = key;
                                        console.log('📊 Campo de pontuação definido:', key);
                                    } else {
                                        this.respostasCorretas[key] = value.answer;
                                        console.log('✅ Resposta correta registrada:', {campo: key, resposta: value.answer});
                                    }
                                });

                                console.log('✅ Todas respostas processadas:', this.respostasCorretas);

                                if (!wpformsQuizData.scoreFieldId) {
                                    console.warn('⚠️ Campo de pontuação não encontrado nos dados');
                                }
                                resolve();
                            } else {
                                console.error('❌ Erro na resposta:', response ? response.data.message : 'Resposta inválida');
                                reject();
                            }
                        },
                        error: (error) => {
                            console.error('❌ Erro na requisição AJAX:', error);
                            this.showNotification('Erro ao carregar respostas', 'error');
                            reject();
                        }
                    });
                    console.groupEnd();
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

            const pontos = this.calcularPontuacao();
            const notaDecimal = Math.round(pontos * 10) / 10;
            const notaInteira = Math.round(notaDecimal);

            console.log('📊 Notas calculadas:', {
                decimal: notaDecimal,
                inteira: notaInteira
            });

            // Atualiza a div com o ID do campo de pontuação
            const scoreFieldId = wpformsQuizData.scoreFieldId;
            console.log('🔍 scoreFieldId:', scoreFieldId);

            if (scoreFieldId) {
                // Tenta diferentes seletores para encontrar o elemento
                let scoreElement = document.querySelector(`#wpforms-${wpformsQuizData.formId}-field_${scoreFieldId}`);
                console.log('🔍 scoreElement:', scoreElement);

                if (scoreElement) {
                    // Verifica se o elemento foi encontrado e tem um ID válido
                    if (scoreElement.id) {
                        console.log('✅ Atualizando elemento com ID:', scoreElement.id);
                        
                        // Atualiza o valor baseado no tipo de elemento
                        if (scoreElement.tagName === 'INPUT') {
                            scoreElement.value = notaInteira;
                            // Dispara evento de mudança
                            scoreElement.dispatchEvent(new Event('change', { bubbles: true }));
                        } else {
                            scoreElement.textContent = notaInteira;
                        }
                    }
                } else {
                    // Se não encontrou o elemento principal, tenta outros seletores
                    const formElement = document.querySelector('form[id^="wpforms-form-"]');
                    
                    if (formElement) {
                        const matches = formElement.id.match(/wpforms-form-(\d+)/);
                        if (matches) {
                            wpformsQuizData.formId = matches[1];
                            console.log('🔍 Form ID encontrado no DOM:', wpformsQuizData.formId);
                            
                            const altScoreElement = document.querySelector(`[data-field="${scoreFieldId}"]`) ||
                                document.querySelector(`#wpforms-field-${scoreFieldId}`);
                            console.log('🔍 altScoreElement:', altScoreElement);

                            if (altScoreElement) {
                                if (altScoreElement.tagName === 'INPUT') {
                                    altScoreElement.value = notaInteira;
                                    altScoreElement.dispatchEvent(new Event('change', { bubbles: true }));
                                } else {
                                    altScoreElement.textContent = notaInteira;
                                }
                            } else {
                                console.error('❌ Elemento de pontuação não encontrado');
                            }
                        }
                    }
                }
            
                // Atualiza os displays adicionais se existirem 
                if (typeof this.atualizarDisplays === 'function') {
                    this.atualizarDisplays(notaDecimal);
                }

                console.groupEnd();
            }
        }

        calcularPontuacao() {
            console.group('🎯 Calculando Pontuação');
            // Verifica se wpformsQuizData está disponível
            if (typeof wpformsQuizData === 'undefined') {
                console.error('❌ wpformsQuizData não está definido');
                return;
            }

            // Obtém o formulário dinamicamente usando os atributos da imagem
            const formId = document.querySelector('form[data-id]')?.dataset?.id || wpformsQuizData.formId;
            console.log('🔍 formId', formId);

            if (!formId) {
                console.error('❌ Formulário não encontrado');
                console.groupEnd();
                return 0;
            }

            // Busca o formulário usando os atributos name e id
            const form = document.querySelector(`form[name="wpforms-builder"][id="wpforms-builder-form"]`) || 
                        document.querySelector(`#wpforms-form-${formId}`);

            // Busca campos de resposta (radio e select) dentro do formulário
            const camposResposta = form ? form.querySelectorAll('input[type="radio"]:checked, select') : [];
            const totalCampos = this.respostasCorretas ? Object.keys(this.respostasCorretas).length : 0;

            console.log('🔍 form', form);
            console.log('🔍 camposResposta', camposResposta); 
            console.log('🔍 totalCampos', totalCampos);

            console.log('📊 Total de campos:', totalCampos);

            if (!totalCampos) {
                console.error('❌ Nenhuma resposta correta cadastrada');
                console.groupEnd();
                return 0;
            }

            let pontosAcumulados = 0;
            const valorPorQuestao = 10 / totalCampos; // Cada questão vale uma parte igual de 10

            camposResposta.forEach(campo => {
                const fieldId = this.getFieldId(campo);
                if (!fieldId) return;

                const respostaCorreta = this.respostasCorretas[fieldId];
                const respostaUsuario = campo.value;

                console.log('🔍 Verificando campo:', {
                    fieldId,
                    respostaUsuario,
                    respostaCorreta,
                    valorQuestao: valorPorQuestao
                });

                if (respostaCorreta && respostaUsuario === respostaCorreta) {
                    pontosAcumulados += valorPorQuestao;
                    console.log('✅ Resposta correta! Pontos acumulados:', pontosAcumulados);
                }
            });

            // Calcula a nota final (regra de 3)
            const notaFinal = (pontosAcumulados / totalCampos) * 10;

            console.log('📝 Resultado:', {
                acertos: pontosAcumulados,
                total: totalCampos,
                notaFinal: pontosAcumulados
            });

            console.groupEnd();
            return pontosAcumulados;
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

        initScoreFieldSave() {
            console.log('🔍 Inicializando salvamento do campo');

            const saveButton = $('#save-score-field');
            const select = $('#quiz_score_field');

            if (saveButton.length && select.length) {
                saveButton.on('click', () => {
                    console.log('🔔 Botão clicado');

                    const fieldId = select.val();
                    const formId = select.data('formId');

                    if (!fieldId || !formId) {
                        console.error('❌ IDs inválidos');
                        return;
                    }

                    const spinner = saveButton.next('.spinner');
                    saveButton.prop('disabled', true);
                    spinner.css('visibility', 'visible');

                    $.ajax({
                        url: wpformsQuizData.ajaxurl,
                        type: 'POST',
                        data: {
                            action: 'save_quiz_score_field',
                            nonce: wpformsQuizData.nonce,
                            form_id: formId,
                            field_id: fieldId
                        },
                        success: function (response) {
                            if (response.success) {
                                alert('Campo salvo com sucesso!');
                            } else {
                                alert('Erro ao salvar: ' + (response.data?.message || 'Erro desconhecido'));
                            }
                        },
                        error: function (error) {
                            console.error('❌ Erro:', error);
                            alert('Erro ao salvar campo');
                        },
                        complete: function () {
                            saveButton.prop('disabled', false);
                            spinner.css('visibility', 'hidden');
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
            const displays = document.querySelectorAll(`.quiz-score-display[data-form-id="${wpformsQuizData.formId}"]`);
            displays.forEach(display => {
                display.textContent = notaDecimal;
            });
        }
    }

    // Inicializa quando o documento estiver pronto
    $(document).ready(() => {
        new WPFormsQuizScore();
    });

    // Adicione isso dentro do método add_settings_script()
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
                // Reabilita o botão e esconde o spinner
                $button.prop('disabled', false);
                $spinner.css('visibility', 'hidden');
                console.groupEnd();
            }
        });
    });
})(jQuery); 